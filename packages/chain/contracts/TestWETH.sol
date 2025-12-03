// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title TestWETH - An ERC20Permit token with 18 decimals (like real WETH)
/// @notice Used for testing permit flow with ETH-equivalent token
contract TestWETH is ERC20, ERC20Permit {
    constructor() ERC20("Test Wrapped Ether", "WETH") ERC20Permit("Test Wrapped Ether") {
        _mint(msg.sender, 10_000 * 10 ** decimals()); // 10,000 WETH initial supply
    }

    function decimals() public pure override returns (uint8) {
        return 18; // WETH uses 18 decimals
    }

    /// @notice Faucet for testing - anyone can mint
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
