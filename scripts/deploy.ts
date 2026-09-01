import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  maxUint256,
  parseEther,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { compileContracts } from "../src/compile.js";
import { sepoliaL2 } from "../src/network.js";

const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte development-only private key.");
}

const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) {
  throw new Error("SEPOLIA_RPC_URL must contain the HTTPS endpoint for chain 84532.");
}
const parsedRpcUrl = new URL(rpcUrl);
if (parsedRpcUrl.protocol !== "https:") {
  throw new Error("SEPOLIA_RPC_URL must use HTTPS.");
}
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: sepoliaL2, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: sepoliaL2, transport: http(rpcUrl) });
const artifacts = compileContracts();

const connectedChainId = await publicClient.getChainId();
if (connectedChainId !== sepoliaL2.id) {
  throw new Error(`RPC chain mismatch: expected Sepolia L2 ${sepoliaL2.id}, received ${connectedChainId}.`);
}

async function deploy(name: string, args: readonly unknown[]) {
  const artifact = artifacts[name];
  if (!artifact) throw new Error(`Missing artifact: ${name}`);
  const hash = await walletClient.deployContract({
    account,
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error(`${name} deployment did not return an address.`);
  console.log(`${name}: ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

const weth = await deploy("MockERC20", ["Mock Wrapped Ether", "mWETH", 18]);
const usdc = await deploy("MockERC20", ["Mock USD Coin", "mUSDC", 6]);
const oraclePrice = BigInt(process.env.ORACLE_INITIAL_PRICE_X18 ?? "2000000000000000000000");
const oracle = await deploy("ScenarioOracle", [oraclePrice]);
const feeBps = Number(process.env.POOL_FEE_BPS ?? "30");
const pool = await deploy("ConstantProductPool", [weth, usdc, feeBps]);

if (process.env.SEED_LIQUIDITY === "true") {
  const mockAbi = artifacts.MockERC20.abi;
  const poolAbi = artifacts.ConstantProductPool.abi;
  const wethAmount = parseEther("10");
  const usdcAmount = parseUnits("20000", 6);

  for (const [address, amount] of [[weth, wethAmount], [usdc, usdcAmount]] as const) {
    const mintHash = await walletClient.writeContract({
      account,
      address,
      abi: mockAbi,
      functionName: "mint",
      args: [account.address, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });
    const approveHash = await walletClient.writeContract({
      account,
      address,
      abi: mockAbi,
      functionName: "approve",
      args: [pool, maxUint256],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  const block = await publicClient.getBlock();
  const liquidityHash = await walletClient.writeContract({
    account,
    address: pool,
    abi: poolAbi,
    functionName: "addLiquidity",
    args: [wethAmount, usdcAmount, 0n, account.address, block.timestamp + 600n],
  });
  await publicClient.waitForTransactionReceipt({ hash: liquidityHash });
  console.log("Seeded 10 mWETH / 20,000 mUSDC.");
}

const deployment = {
  chainId: sepoliaL2.id,
  deployer: account.address,
  contracts: { weth, usdc, oracle, pool },
  createdAt: new Date().toISOString(),
};
mkdirSync(join(process.cwd(), "deployments"), { recursive: true });
writeFileSync(
  join(process.cwd(), "deployments", "sepolia-l2.json"),
  `${JSON.stringify(deployment, null, 2)}\n`,
);
