// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {Fund} from "../contracts/Fund.sol";
import {FundFactory} from "../contracts/FundFactory.sol";
import {FundToken, FUND_TOKEN_DECIMALS} from "../contracts/FundToken.sol";

// solc-ignore-next-line code-size
abstract contract FundBaseTest is Test {
  ///////////////
  // Constants //
  ///////////////

  uint256 private constant _LAUNCHER_PK = 1;
  uint256 private constant _WORKER_BASE_PK = 10;
  uint256 private constant _ORACLE_BASE_PK = 20;
  uint256 private constant _FUNDER_BASE_PK = 30;
  uint256 public constant PERROLE_COUNT = 5;

  uint256 public constant BLOCK_START_TIME = 1e7;
  uint256 public constant BLOCK_PERMIT_TIME = BLOCK_START_TIME + 1e2;
  uint256 public constant FUND_CUT = 1e3; // 10%
  uint256 public constant FUNDER_BASE_AMOUNT = 1e3 * 10 ** FUND_TOKEN_DECIMALS;
  uint256 public constant DEPO_AMOUNT = 1e1 * 10 ** FUND_TOKEN_DECIMALS;
  uint256 public constant DEPO_CUT = 1e0 * 10 ** FUND_TOKEN_DECIMALS;

  /////////////////////
  // State Variables //
  /////////////////////

  mapping(address => uint256) private _keys;
  address internal _launcher;
  address[] internal _workers;
  address[] internal _oracles;
  address[] internal _funders;

  Fund internal _fundImplementation;
  FundFactory internal _fundFactory;
  FundToken internal _fundToken;
  Fund[] internal _funds;

  ///////////////
  // Functions //
  ///////////////

  function setUp() public virtual {
    vm.warp(BLOCK_START_TIME);
    _launcher = _register(_LAUNCHER_PK);
    for (uint256 i = 0; i < PERROLE_COUNT; i++) {
      _workers.push(_register(_WORKER_BASE_PK + i));
      _oracles.push(_register(_ORACLE_BASE_PK + i));
      _funders.push(_register(_FUNDER_BASE_PK + i));
    }

    vm.prank(_launcher);
    _fundToken = new FundToken();
    for (uint256 i = 0; i < PERROLE_COUNT; i++) {
      vm.prank(_launcher);
      _fundToken.transfer(_funders[i], FUNDER_BASE_AMOUNT);
    }

    vm.prank(_launcher);
    _fundImplementation = new Fund();

    vm.prank(_launcher);
    _fundFactory = new FundFactory(_fundImplementation);
  }

  function _closeAs(Fund fund, address closer) internal {
    vm.prank(closer);
    fund.close();
  }

  function _refundAs(Fund fund, address refunder) internal {
    vm.prank(refunder);
    fund.refund();
  }

  function _withdrawFrom(Fund fund, uint256 amount) internal {
    bytes memory oracleWithdrawalSignature = _signAs(fund.oracle(), fund.hashWithdraw(amount));
    vm.prank(fund.worker());
    fund.withdraw(amount, oracleWithdrawalSignature);
  }

  function _fundAs(Fund fund, address funder, uint256 amount) internal {
    bytes32 hashPermit = _fundToken.hashPermit(funder, address(fund), amount, BLOCK_PERMIT_TIME);
    bytes memory signature = _signAs(funder, hashPermit);
    vm.prank(funder);
    fund.deposit(_fundToken, funder, amount, BLOCK_PERMIT_TIME, signature);
  }

  function _signAs(address signer, bytes32 data) internal view returns (bytes memory signature) {
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(_keys[signer], data);
    return abi.encodePacked(r, s, v);
  }

  function _register(uint256 pk) private returns (address addr) {
    addr = vm.addr(pk);
    _keys[addr] = pk;
  }
}
