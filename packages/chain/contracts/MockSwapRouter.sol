// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface AggregatorV3Interface {
  function decimals() external view returns (uint8);
  function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

contract MockSwapRouter {
    using SafeERC20 for IERC20;

    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    // Price feed registry: token => Chainlink price feed
    mapping(address => address) public priceFeeds;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    /// @notice Set price feed for a token (only owner)
    function setPriceFeed(address token, address feed) external {
        require(msg.sender == owner, "Only owner");
        priceFeeds[token] = feed;
    }

    /// @notice Swaps `amountIn` of one token for as much as possible of another token
    /// @dev This mock uses oracle prices to calculate fair swap amounts
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        // 1. "Take" the input tokens from the Fund
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);

        // 2. Get token decimals
        uint8 decimalsIn = IERC20Metadata(params.tokenIn).decimals();
        uint8 decimalsOut = IERC20Metadata(params.tokenOut).decimals();

        // 3. Get oracle prices (assuming 8 decimal Chainlink feeds)
        address feedIn = priceFeeds[params.tokenIn];
        address feedOut = priceFeeds[params.tokenOut];
        require(feedIn != address(0) && feedOut != address(0), "Price feed not set");

        (, int256 priceIn, , , ) = AggregatorV3Interface(feedIn).latestRoundData();
        (, int256 priceOut, , , ) = AggregatorV3Interface(feedOut).latestRoundData();
        require(priceIn > 0 && priceOut > 0, "Invalid price");

        // 4. Calculate output amount using oracle prices
        // Formula: amountOut = (amountIn * priceIn * 10^decimalsOut) / (priceOut * 10^decimalsIn)
        // Simplified: amountOut = (amountIn * priceIn) / priceOut, then adjust for decimals
        uint256 valueIn = params.amountIn * uint256(priceIn); // USD value in (amountIn * 10^decimalsIn * 10^8)
        uint256 rawAmountOut = valueIn / uint256(priceOut);   // Convert to tokenOut units (still in 10^decimalsIn * 10^8)
        
        // Adjust for decimal differences: rawAmountOut is in decimalsIn + 8 decimals from price feed
        // We need to convert to decimalsOut
        // rawAmountOut has scale: decimalsIn + 8 (from price feed)
        // We want scale: decimalsOut
        // So: amountOut = rawAmountOut * 10^decimalsOut / (10^decimalsIn * 10^8)
        //              = rawAmountOut * 10^decimalsOut / 10^(decimalsIn + 8)
        
        if (decimalsOut + 8 >= decimalsIn + 8) {
            amountOut = rawAmountOut * (10 ** (decimalsOut - decimalsIn));
        } else {
            amountOut = rawAmountOut / (10 ** (decimalsIn - decimalsOut));
        }

        // 5. "Give" the output tokens to the recipient (Fund)
        // Note: This contract must be funded with sufficient 'tokenOut' beforehand!
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);
    }
}
