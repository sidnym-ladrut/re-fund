// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title TestUSDC - An ERC20Permit token with 6 decimals (like real USDC)
/// @notice Used for testing permit flow with different decimal precision
contract TestUSDC is ERC20, ERC20Permit {
    constructor() ERC20("Test USDC", "USDC") ERC20Permit("Test USDC") {
        _mint(msg.sender, 1_000_000_000 * 10 ** decimals());
    }

    function decimals() public pure override returns (uint8) {
        return 6; // USDC uses 6 decimals
    }

    /// @notice Faucet for testing - anyone can mint
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
