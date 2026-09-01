// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "./interfaces/IERC20.sol";

contract ConstantProductPool {
    error DeadlineExpired();
    error IdenticalTokens();
    error InsufficientLiquidity();
    error InsufficientOutput();
    error InvalidAmount();
    error InvalidFee();
    error InvalidTokenContract();
    error InvalidToken();
    error Reentrancy();
    error SlippageExceeded();
    error TokenTransferFailed();
    error ZeroAddress();

    uint256 public constant BPS = 10_000;

    address public immutable token0;
    address public immutable token1;
    uint16 public immutable feeBps;

    uint256 public reserve0;
    uint256 public reserve1;
    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;

    uint256 private unlocked = 1;

    event LiquidityAdded(
        address indexed provider,
        address indexed recipient,
        uint256 amount0,
        uint256 amount1,
        uint256 shares
    );
    event LiquidityRemoved(
        address indexed provider,
        address indexed recipient,
        uint256 amount0,
        uint256 amount1,
        uint256 shares
    );
    event Swap(
        address indexed sender,
        address indexed recipient,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountOut
    );
    event Sync(uint256 reserve0, uint256 reserve1);

    modifier nonReentrant() {
        if (unlocked != 1) revert Reentrancy();
        unlocked = 2;
        _;
        unlocked = 1;
    }

    modifier beforeDeadline(uint256 deadline) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        _;
    }

    constructor(address token0_, address token1_, uint16 feeBps_) {
        if (token0_ == address(0) || token1_ == address(0)) revert ZeroAddress();
        if (token0_ == token1_) revert IdenticalTokens();
        if (token0_.code.length == 0 || token1_.code.length == 0) revert InvalidTokenContract();
        if (feeBps_ >= BPS) revert InvalidFee();
        token0 = token0_;
        token1 = token1_;
        feeBps = feeBps_;
    }

    function addLiquidity(
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 minShares,
        address recipient,
        uint256 deadline
    ) external nonReentrant beforeDeadline(deadline) returns (uint256 shares) {
        if (amount0Desired == 0 || amount1Desired == 0) revert InvalidAmount();
        if (recipient == address(0)) revert ZeroAddress();

        uint256 balance0Before = IERC20(token0).balanceOf(address(this));
        uint256 balance1Before = IERC20(token1).balanceOf(address(this));
        _safeTransferFrom(token0, msg.sender, address(this), amount0Desired);
        _safeTransferFrom(token1, msg.sender, address(this), amount1Desired);
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - balance0Before;
        uint256 amount1 = balance1 - balance1Before;

        if (totalShares == 0) {
            shares = _sqrt(amount0 * amount1);
        } else {
            shares = _min(
                amount0 * totalShares / reserve0,
                amount1 * totalShares / reserve1
            );
        }
        if (shares == 0) revert InsufficientLiquidity();
        if (shares < minShares) revert SlippageExceeded();

        totalShares += shares;
        sharesOf[recipient] += shares;
        _sync(balance0, balance1);
        emit LiquidityAdded(msg.sender, recipient, amount0, amount1, shares);
    }

    function removeLiquidity(
        uint256 shares,
        uint256 minAmount0,
        uint256 minAmount1,
        address recipient,
        uint256 deadline
    ) external nonReentrant beforeDeadline(deadline) returns (uint256 amount0, uint256 amount1) {
        if (shares == 0 || shares > sharesOf[msg.sender]) revert InvalidAmount();
        if (recipient == address(0)) revert ZeroAddress();

        amount0 = shares * reserve0 / totalShares;
        amount1 = shares * reserve1 / totalShares;
        if (amount0 < minAmount0 || amount1 < minAmount1) revert SlippageExceeded();

        sharesOf[msg.sender] -= shares;
        totalShares -= shares;
        _safeTransfer(token0, recipient, amount0);
        _safeTransfer(token1, recipient, amount1);
        _syncBalances();
        emit LiquidityRemoved(msg.sender, recipient, amount0, amount1, shares);
    }

    function swapExactIn(
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        uint256 deadline
    ) external nonReentrant beforeDeadline(deadline) returns (uint256 amountOut) {
        if (amountIn == 0) revert InvalidAmount();
        if (recipient == address(0)) revert ZeroAddress();
        bool zeroForOne;
        if (tokenIn == token0) {
            zeroForOne = true;
        } else if (tokenIn != token1) {
            revert InvalidToken();
        }

        uint256 reserveIn = zeroForOne ? reserve0 : reserve1;
        uint256 reserveOut = zeroForOne ? reserve1 : reserve0;
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();

        uint256 balanceInBefore = IERC20(tokenIn).balanceOf(address(this));
        _safeTransferFrom(tokenIn, msg.sender, address(this), amountIn);
        uint256 received = IERC20(tokenIn).balanceOf(address(this)) - balanceInBefore;
        amountOut = getAmountOut(received, reserveIn, reserveOut);
        if (amountOut == 0 || amountOut < minAmountOut) revert InsufficientOutput();

        address tokenOut = zeroForOne ? token1 : token0;
        _safeTransfer(tokenOut, recipient, amountOut);
        _syncBalances();
        emit Swap(msg.sender, recipient, tokenIn, received, amountOut);
    }

    function quoteExactIn(address tokenIn, uint256 amountIn) external view returns (uint256) {
        if (tokenIn == token0) return getAmountOut(amountIn, reserve0, reserve1);
        if (tokenIn == token1) return getAmountOut(amountIn, reserve1, reserve0);
        revert InvalidToken();
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public view returns (uint256) {
        if (amountIn == 0) revert InvalidAmount();
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();
        uint256 amountInWithFee = amountIn * (BPS - feeBps);
        return amountInWithFee * reserveOut / (reserveIn * BPS + amountInWithFee);
    }

    function sync() external nonReentrant {
        _syncBalances();
    }

    function _syncBalances() internal {
        _sync(
            IERC20(token0).balanceOf(address(this)),
            IERC20(token1).balanceOf(address(this))
        );
    }

    function _sync(uint256 balance0, uint256 balance1) internal {
        reserve0 = balance0;
        reserve1 = balance1;
        emit Sync(balance0, balance1);
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeCall(IERC20.transfer, (to, amount))
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeCall(IERC20.transferFrom, (from, to, amount))
        );
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
    }

    function _sqrt(uint256 value) internal pure returns (uint256 result) {
        if (value == 0) return 0;
        uint256 estimate = (value + 1) / 2;
        result = value;
        while (estimate < result) {
            result = estimate;
            estimate = (value / estimate + estimate) / 2;
        }
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
