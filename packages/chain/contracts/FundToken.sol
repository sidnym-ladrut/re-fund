// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

string constant FUND_TOKEN_NAME = "Fund Token";
string constant FUND_TOKEN_SYMBOL = "$fund";
uint256 constant FUND_TOKEN_DECIMALS = 18;
uint256 constant FUND_TOKEN_COUNT = 1e9;
uint256 constant FUND_TOKEN_SUPPLY = FUND_TOKEN_COUNT * 10 ** FUND_TOKEN_DECIMALS;

contract FundToken is ERC20, ERC20Permit {
  ////////////////////////
  // Constant Variables //
  ////////////////////////

  bytes32 private constant _PERMIT_TYPEHASH =
      keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

  ///////////////
  // Functions //
  ///////////////

  constructor() ERC20(FUND_TOKEN_NAME, FUND_TOKEN_SYMBOL) ERC20Permit(FUND_TOKEN_NAME) {
    _mint(msg.sender, FUND_TOKEN_SUPPLY);
  }

  function hashPermit(address owner, address spender, uint256 value, uint256 deadline)
      public view returns (bytes32) {
    bytes32 structHash = keccak256(abi.encode(_PERMIT_TYPEHASH, owner, spender, value, nonces(owner), deadline));
    bytes32 hash = _hashTypedDataV4(structHash);
    return hash;
  }
}
