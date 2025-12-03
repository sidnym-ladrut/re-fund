// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestUSDT - A simple ERC20 without permit support (like real USDT)
/// @notice Used for testing standard approve+transfer flow
contract TestUSDT is ERC20 {
    constructor() ERC20("Test USDT", "USDT") {
        _mint(msg.sender, 1_000_000_000 * 10 ** decimals());
    }

    function decimals() public pure override returns (uint8) {
        return 6; // USDT uses 6 decimals
    }

    /// @notice Faucet for testing - anyone can mint
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
