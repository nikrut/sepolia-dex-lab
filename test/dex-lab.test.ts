import ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  custom,
  maxUint256,
  parseEther,
  parseUnits,
  type Address,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { compileContracts, type ContractArtifact } from "../src/compile.js";
import { sepoliaL2 } from "../src/network.js";

const artifacts = compileContracts();

describe("Sepolia DEX Lab", () => {
  let publicClient: any;
  let walletClient: any;
  let provider: any;
  let snapshotId: string;
  let ownerAccount: PrivateKeyAccount;
  let traderAccount: PrivateKeyAccount;
  let owner: Address;
  let trader: Address;
  let weth: Address;
  let usdc: Address;
  let pool: Address;
  let oracle: Address;

  async function deploy(artifact: ContractArtifact, args: readonly unknown[]): Promise<Address> {
    const hash = await walletClient.deployContract({
      account: ownerAccount,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      args,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 10 });
    return receipt.contractAddress!;
  }

  async function write(
    address: Address,
    artifact: ContractArtifact,
    functionName: string,
    args: readonly unknown[],
    account: PrivateKeyAccount = ownerAccount,
  ) {
    const hash = await walletClient.writeContract({
      account,
      address,
      abi: artifact.abi,
      functionName,
      args,
    });
    return publicClient.waitForTransactionReceipt({ hash, pollingInterval: 10 });
  }

  beforeAll(async () => {
    provider = ganache.provider({
      logging: { quiet: true },
      wallet: { totalAccounts: 3, defaultBalance: 1_000 },
      chain: { chainId: sepoliaL2.id },
    });
    const initialAccounts = Object.values(provider.getInitialAccounts()) as Array<{ secretKey: string }>;
    ownerAccount = privateKeyToAccount(initialAccounts[0].secretKey as `0x${string}`);
    traderAccount = privateKeyToAccount(initialAccounts[1].secretKey as `0x${string}`);
    publicClient = createPublicClient({
      chain: sepoliaL2,
      pollingInterval: 10,
      transport: custom(provider as any),
    });
    walletClient = createWalletClient({
      account: ownerAccount,
      chain: sepoliaL2,
      transport: custom(provider as any),
    });
    owner = ownerAccount.address;
    trader = traderAccount.address;

    weth = await deploy(artifacts.MockERC20, ["Mock Wrapped Ether", "mWETH", 18]);
    usdc = await deploy(artifacts.MockERC20, ["Mock USD Coin", "mUSDC", 6]);
    oracle = await deploy(artifacts.ScenarioOracle, [parseEther("2000")]);
    pool = await deploy(artifacts.ConstantProductPool, [weth, usdc, 30]);

    await write(weth, artifacts.MockERC20, "mint", [owner, parseEther("100")]);
    await write(usdc, artifacts.MockERC20, "mint", [owner, parseUnits("200000", 6)]);
    await write(weth, artifacts.MockERC20, "mint", [trader, parseEther("10")]);
    await write(usdc, artifacts.MockERC20, "mint", [trader, parseUnits("20000", 6)]);
    await write(weth, artifacts.MockERC20, "approve", [pool, maxUint256]);
    await write(usdc, artifacts.MockERC20, "approve", [pool, maxUint256]);
    await write(weth, artifacts.MockERC20, "approve", [pool, maxUint256], traderAccount);
    await write(usdc, artifacts.MockERC20, "approve", [pool, maxUint256], traderAccount);
  });

  beforeEach(async () => {
    snapshotId = await provider.request({ method: "evm_snapshot", params: [] }) as string;
  });

  afterEach(async () => {
    await provider.request({ method: "evm_revert", params: [snapshotId] });
  });

  async function addInitialLiquidity() {
    const block = await publicClient.getBlock();
    await write(pool, artifacts.ConstantProductPool, "addLiquidity", [
      parseEther("50"),
      parseUnits("100000", 6),
      0n,
      owner,
      block.timestamp + 60n,
    ]);
  }

  it("mints proportional liquidity shares", async () => {
    await addInitialLiquidity();
    const [reserve0, reserve1, totalShares, ownerShares] = await Promise.all([
      publicClient.readContract({ address: pool, abi: artifacts.ConstantProductPool.abi, functionName: "reserve0" }),
      publicClient.readContract({ address: pool, abi: artifacts.ConstantProductPool.abi, functionName: "reserve1" }),
      publicClient.readContract({ address: pool, abi: artifacts.ConstantProductPool.abi, functionName: "totalShares" }),
      publicClient.readContract({ address: pool, abi: artifacts.ConstantProductPool.abi, functionName: "sharesOf", args: [owner] }),
    ]);
    expect(reserve0).toBe(parseEther("50"));
    expect(reserve1).toBe(parseUnits("100000", 6));
    expect(totalShares).toBe(ownerShares);
    expect(totalShares as bigint).toBeGreaterThan(0n);
  });

  it("swaps exact input, charges the configured fee, and preserves k", async () => {
    await addInitialLiquidity();
    const reserve0Before = (await publicClient.readContract({
      address: pool,
      abi: artifacts.ConstantProductPool.abi,
      functionName: "reserve0",
    })) as bigint;
    const reserve1Before = (await publicClient.readContract({
      address: pool,
      abi: artifacts.ConstantProductPool.abi,
      functionName: "reserve1",
    })) as bigint;
    const amountIn = parseEther("1");
    const quote = (await publicClient.readContract({
      address: pool,
      abi: artifacts.ConstantProductPool.abi,
      functionName: "quoteExactIn",
      args: [weth, amountIn],
    })) as bigint;
    const traderUsdcBefore = (await publicClient.readContract({
      address: usdc,
      abi: artifacts.MockERC20.abi,
      functionName: "balanceOf",
      args: [trader],
    })) as bigint;
    const block = await publicClient.getBlock();

    await write(pool, artifacts.ConstantProductPool, "swapExactIn", [
      weth,
      amountIn,
      quote,
      trader,
      block.timestamp + 60n,
    ], traderAccount);

    const reserve0After = (await publicClient.readContract({
      address: pool,
      abi: artifacts.ConstantProductPool.abi,
      functionName: "reserve0",
    })) as bigint;
    const reserve1After = (await publicClient.readContract({
      address: pool,
      abi: artifacts.ConstantProductPool.abi,
      functionName: "reserve1",
    })) as bigint;
    const traderUsdcAfter = (await publicClient.readContract({
      address: usdc,
      abi: artifacts.MockERC20.abi,
      functionName: "balanceOf",
      args: [trader],
    })) as bigint;

    expect(traderUsdcAfter - traderUsdcBefore).toBe(quote);
    expect(reserve0After * reserve1After).toBeGreaterThanOrEqual(reserve0Before * reserve1Before);
  });

  it("rejects swaps when the caller's slippage floor cannot be met", async () => {
    await addInitialLiquidity();
    const block = await publicClient.getBlock();
    await expect(
      write(pool, artifacts.ConstantProductPool, "swapExactIn", [
        weth,
        parseEther("1"),
        parseUnits("100000", 6),
        trader,
        block.timestamp + 60n,
      ], traderAccount),
    ).rejects.toThrow();
  });

  it("returns a proportional share of both reserves", async () => {
    await addInitialLiquidity();
    const shares = (await publicClient.readContract({
      address: pool,
      abi: artifacts.ConstantProductPool.abi,
      functionName: "sharesOf",
      args: [owner],
    })) as bigint;
    const [reserve0, totalShares] = await Promise.all([
      publicClient.readContract({
        address: pool,
        abi: artifacts.ConstantProductPool.abi,
        functionName: "reserve0",
      }) as Promise<bigint>,
      publicClient.readContract({
        address: pool,
        abi: artifacts.ConstantProductPool.abi,
        functionName: "totalShares",
      }) as Promise<bigint>,
    ]);
    const sharesToRemove = shares / 2n;
    const expectedWeth = sharesToRemove * reserve0 / totalShares;
    const wethBefore = (await publicClient.readContract({
      address: weth,
      abi: artifacts.MockERC20.abi,
      functionName: "balanceOf",
      args: [owner],
    })) as bigint;
    const block = await publicClient.getBlock();
    await write(pool, artifacts.ConstantProductPool, "removeLiquidity", [
      sharesToRemove,
      0n,
      0n,
      owner,
      block.timestamp + 60n,
    ]);
    const wethAfter = (await publicClient.readContract({
      address: weth,
      abi: artifacts.MockERC20.abi,
      functionName: "balanceOf",
      args: [owner],
    })) as bigint;
    expect(wethAfter - wethBefore).toBe(expectedWeth);
  });

  it("allows only the oracle owner to change a scenario price", async () => {
    await expect(
      write(oracle, artifacts.ScenarioOracle, "setPrice", [parseEther("1800")], traderAccount),
    ).rejects.toThrow();
    await write(oracle, artifacts.ScenarioOracle, "setPrice", [parseEther("1800")]);
    const price = await publicClient.readContract({
      address: oracle,
      abi: artifacts.ScenarioOracle.abi,
      functionName: "priceX18",
    });
    expect(price).toBe(parseEther("1800"));
  });

  it("rejects token addresses that do not contain contract code", async () => {
    await expect(
      deploy(artifacts.ConstantProductPool, [owner, trader, 30]),
    ).rejects.toThrow();
  });
});
