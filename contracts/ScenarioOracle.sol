// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract ScenarioOracle {
    error NotOwner();
    error InvalidPrice();
    error ZeroAddress();

    address public owner;
    uint256 public priceX18;
    uint256 public updatedAt;

    event PriceUpdated(uint256 indexed priceX18, uint256 indexed timestamp);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(uint256 initialPriceX18) {
        if (initialPriceX18 == 0) revert InvalidPrice();
        owner = msg.sender;
        priceX18 = initialPriceX18;
        updatedAt = block.timestamp;
        emit OwnershipTransferred(address(0), msg.sender);
        emit PriceUpdated(initialPriceX18, block.timestamp);
    }

    function setPrice(uint256 newPriceX18) external onlyOwner {
        if (newPriceX18 == 0) revert InvalidPrice();
        priceX18 = newPriceX18;
        updatedAt = block.timestamp;
        emit PriceUpdated(newPriceX18, block.timestamp);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
