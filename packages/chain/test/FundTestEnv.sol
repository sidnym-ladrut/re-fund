// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Fund} from "../contracts/Fund.sol";
import {FundFactory} from "../contracts/FundFactory.sol";
import {FundToken, FUND_TOKEN_DECIMALS} from "../contracts/FundToken.sol";
// import {console} from "forge-std/console.sol";

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// solc-ignore-next-line code-size
contract FundTestEnv is Test {
  ///////////////
  // Constants //
  ///////////////

  uint256 public constant LAUNCHER_PK = 1;
  uint256 public constant WORKER_PK = 2;
  uint256 public constant ORACLE_PK = 3;

  uint256 public constant FUNDER_BASE_PK = 10;
  uint256 public constant FUNDER_COUNT = 5;

  uint256 public constant FUND_CUT = 1e3; // 10%
  bytes32 public constant FUND_TERMS = bytes32(uint256(100));
  bytes32 public constant BAD_TERMS = bytes32(uint256(101));
  uint256 public constant FUNDER_BASE_AMOUNT = 1e3 * 10 ** FUND_TOKEN_DECIMALS;
  uint256 public constant DEPO_AMOUNT = 1e1 * 10 ** FUND_TOKEN_DECIMALS;
  uint256 public constant DEPO_CUT = 1e0 * 10 ** FUND_TOKEN_DECIMALS;

  /////////////////////
  // State Variables //
  /////////////////////

  address internal launcher;
  address internal worker;
  address internal oracle;
  address[] internal funders;

  Fund internal fundImplementation;
  FundFactory internal fundFactory;
  FundToken internal token;
  Fund internal fund;

  ///////////////
  // Modifiers //
  ///////////////

  modifier locked() {
    bytes memory signature = _signAs191(FUND_TERMS, ORACLE_PK);
    vm.prank(worker);
    fund.lockTerms(signature);
    _;
  }

  modifier fundedBy(uint256 n) {
    require(n <= FUNDER_COUNT);
    for (uint256 i = 0; i < n; i++) { _fundAs(i, (i + 1) * DEPO_AMOUNT); }
    _;
  }

  ///////////////
  // Functions //
  ///////////////

  function setUp() public {
    launcher = vm.addr(LAUNCHER_PK);
    worker = vm.addr(WORKER_PK);
    oracle = vm.addr(ORACLE_PK);

    vm.prank(launcher);
    token = new FundToken();
    for (uint256 i = 0; i < FUNDER_COUNT; i++) {
      funders.push(vm.addr(FUNDER_BASE_PK + i));
      vm.prank(launcher);
      token.transfer(funders[i], FUNDER_BASE_AMOUNT);
    }

    vm.prank(worker);
    fund = Fund(fundFactory.deploy(abi.encode(oracle, FUND_CUT, token, FUND_TERMS)));

    vm.prank(launcher);
    fundImplementation = new Fund();
  }

  function _fundAs(uint256 index, uint256 amount) internal {
    (address funder, uint256 funderPK) = _funder(index);
    bytes memory signature = _signAsRaw(token.hashPermit(funder, address(fund), amount, block.timestamp), funderPK);
    vm.prank(funder);
    fund.deposit(token, funder, amount, signature);
  }

  function _funder() internal view returns (address funder, uint256 funderPK) {
    return _funder(0);
  }

  function _funder(uint256 index) internal view returns (address funder, uint256 funderPK) {
    return (funders[index], FUNDER_BASE_PK + index);
  }

  function _signAs191(bytes32 data, uint256 pk) internal pure returns (bytes memory signature) {
    bytes32 hash = MessageHashUtils.toEthSignedMessageHash(data);
    return _signAsRaw(hash, pk);
  }

  function _signAsRaw(bytes32 data, uint256 pk) internal pure returns (bytes memory signature) {
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, data);
    return abi.encodePacked(r, s, v);
  }
}
