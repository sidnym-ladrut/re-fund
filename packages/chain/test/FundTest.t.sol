// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Fund} from "../contracts/Fund.sol";
// import {console} from "forge-std/console.sol";

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

string constant TOKEN_NAME = "Fund Token";
string constant TOKEN_SYMBOL = "$fund";
uint256 constant TOKEN_DECIMALS = 18;
uint256 constant TOKEN_COUNT = 1e9;
uint256 constant TOKEN_SUPPLY = TOKEN_COUNT * 10 ** TOKEN_DECIMALS;

contract FundToken is ERC20, ERC20Permit {
  bytes32 private constant _PERMIT_TYPEHASH =
      keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

  constructor() ERC20(TOKEN_NAME, TOKEN_SYMBOL) ERC20Permit(TOKEN_NAME) {
    _mint(msg.sender, TOKEN_SUPPLY);
  }

  function hashPermit(address owner, address spender, uint256 value, uint256 deadline)
      public view returns (bytes32) {
    bytes32 structHash = keccak256(abi.encode(_PERMIT_TYPEHASH, owner, spender, value, nonces(owner), deadline));
    bytes32 hash = _hashTypedDataV4(structHash);
    return hash;
  }
}

// solc-ignore-next-line code-size
contract FundTest is Test {
  uint256 constant LAUNCHER_PK = 1;
  uint256 constant WORKER_PK = 2;
  uint256 constant ORACLE_PK = 3;

  uint256 constant FUNDER_BASE_PK = 10;
  uint256 constant FUNDER_COUNT = 5;

  uint256 constant FUND_CUT = 1e3; // 10%
  bytes32 constant FUND_TERMS = bytes32(uint256(100));
  bytes32 constant BAD_TERMS = bytes32(uint256(101));
  uint256 constant FUNDER_BASE_AMOUNT = 1e3 * 10 ** TOKEN_DECIMALS;
  uint256 constant DEPO_AMOUNT = 1e1 * 10 ** TOKEN_DECIMALS;
  uint256 constant DEPO_CUT = 1e0 * 10 ** TOKEN_DECIMALS;

  Fund fund;
  FundToken token;

  address launcher;
  address worker;
  address oracle;
  address[] funders;

  //////////////////////
  // Set Up/Tear Down //
  //////////////////////

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
    fund = new Fund(oracle, FUND_CUT, token, FUND_TERMS);
    vm.prank(worker);
  }

  modifier locked() {
    bytes memory signature = _signAs191(FUND_TERMS, ORACLE_PK);
    fund.lockTerms(signature);
    _;
  }

  modifier funded() {
    _fundAs(0, DEPO_AMOUNT);
    _;
  }

  modifier funded2() {
    for (uint256 i = 0; i < 2; i++) { _fundAs(i, DEPO_AMOUNT); }
    _;
  }

  modifier fundedN() {
    for (uint256 i = 0; i < FUNDER_COUNT; i++) { _fundAs(i, i*DEPO_AMOUNT); }
    _;
  }

  ////////////////////
  // Test Functions //
  ////////////////////

  function test_constructor() public view {
    assertEq(fund.worker(), worker);
    assertEq(fund.worker(), fund.owner());
    assertEq(fund.oracle(), oracle);
  }

  function test_lockTerms_success() public {
    bytes memory oracleTermsSignature = _signAs191(FUND_TERMS, ORACLE_PK);
    fund.lockTerms(oracleTermsSignature);
    assertEq(fund.termsSignature(), oracleTermsSignature);
  }

  function test_lockTerms_badSigner() public {
    bytes memory workerTermsSignature = _signAs191(FUND_TERMS, WORKER_PK);
    vm.expectRevert();
    fund.lockTerms(workerTermsSignature);
  }

  function test_lockTerms_badMessage() public {
    bytes memory oracleRandomSignature = _signAs191(BAD_TERMS, ORACLE_PK);
    vm.expectRevert();
    fund.lockTerms(oracleRandomSignature);
  }

  function test_lockTerms_postLock() public locked {
    bytes memory oracleTermsSignature = _signAs191(FUND_TERMS, ORACLE_PK);
    vm.expectRevert();
    fund.lockTerms(oracleTermsSignature);
    vm.expectRevert();
    fund.updateTerms(oracle, FUND_CUT, token, BAD_TERMS);
  }

  function test_deposit_success() public locked {
    (address funder, uint256 funderPK) = _funder();
    bytes32 permitHash = token.hashPermit(funder, address(fund), DEPO_AMOUNT, block.timestamp);
    bytes memory funderDepositSignature = _signAsRaw(permitHash, funderPK);

    vm.expectEmit();
    emit Fund.Deposit(token, funder, DEPO_AMOUNT);
    fund.deposit(token, funder, DEPO_AMOUNT, funderDepositSignature);

    assertEq(token.balanceOf(funder), FUNDER_BASE_AMOUNT - DEPO_AMOUNT);
    assertEq(fund.funds(), DEPO_AMOUNT);
  }

  function test_deposit_badPermit() public locked {
    (address funder, uint256 funderPK) = _funder();
    bytes memory funderDepositSignature = _signAsRaw(BAD_TERMS, funderPK);
    vm.expectRevert();
    fund.deposit(token, funder, DEPO_AMOUNT, funderDepositSignature);
  }

  function test_withdraw_success() public locked funded {
    bytes memory oracleWithdrawalSignature = _signAsRaw(fund.hashWithdraw(DEPO_AMOUNT), ORACLE_PK);

    vm.prank(worker);
    vm.expectEmit();
    emit Fund.Withdrawal(DEPO_AMOUNT);
    fund.withdraw(DEPO_AMOUNT, oracleWithdrawalSignature);

    assertEq(token.balanceOf(worker), DEPO_AMOUNT - DEPO_CUT);
    assertEq(token.balanceOf(oracle), DEPO_CUT);
    assertEq(token.balanceOf(address(fund)), 0);
  }

  function test_withdraw_badSigner() public locked funded {
    bytes memory workerWithdrawalSignature = _signAsRaw(fund.hashWithdraw(DEPO_AMOUNT), WORKER_PK);
    vm.prank(worker);
    vm.expectRevert();
    fund.withdraw(DEPO_AMOUNT, workerWithdrawalSignature);
  }

  function test_withdraw_badMessage() public locked funded {
    bytes memory oracleRandomSignature = _signAs191(BAD_TERMS, ORACLE_PK);
    vm.prank(worker);
    vm.expectRevert();
    fund.withdraw(DEPO_AMOUNT, oracleRandomSignature);
  }

  function test_withdraw_badAmount() public locked funded {
    bytes memory oracleRealWithdrawalSignature = _signAsRaw(fund.hashWithdraw(DEPO_AMOUNT), ORACLE_PK);
    bytes memory oracleZeroWithdrawalSignature = _signAsRaw(fund.hashWithdraw(0), ORACLE_PK);

    vm.prank(worker);
    vm.expectRevert();
    fund.withdraw(DEPO_AMOUNT + 1, oracleRealWithdrawalSignature);

    vm.prank(worker);
    vm.expectRevert();
    fund.withdraw(DEPO_AMOUNT - 1, oracleRealWithdrawalSignature);

    vm.prank(worker);
    vm.expectRevert();
    fund.withdraw(0, oracleZeroWithdrawalSignature);
  }

  function test_refund_uniDonor() public locked funded {
    (address funder, ) = _funder();
    uint256 snapshot = vm.snapshotState();
    address[2] memory managers = [worker, oracle];
    for (uint256 i = 0; i < managers.length; i++) {
      vm.revertToState(snapshot);
      vm.prank(managers[i]);
      vm.expectEmit();
      emit Fund.Refund(managers[i], DEPO_AMOUNT);
      fund.refund();

      assertEq(token.balanceOf(address(fund)), 0);
      assertEq(token.balanceOf(funder), FUNDER_BASE_AMOUNT);
    }
  }

  function test_refund_multiDonor_basic() public locked funded2 {
    vm.prank(worker);
    vm.expectEmit();
    emit Fund.Refund(worker, 2 * DEPO_AMOUNT);
    fund.refund();

    assertEq(token.balanceOf(address(fund)), 0);
    for (uint256 i = 0; i < 2; i++) {
      (address funder, ) = _funder(i);
      assertEq(token.balanceOf(funder), FUNDER_BASE_AMOUNT);
    }
  }

  function test_refund_multiDonor_complex() public locked funded2 {
    _fundAs(1, DEPO_AMOUNT);

    uint256 withdrawAmount = fund.funds() / 2;
    bytes memory oracleWithdrawalSignature = _signAsRaw(fund.hashWithdraw(withdrawAmount), ORACLE_PK);
    vm.prank(worker);
    fund.withdraw(withdrawAmount, oracleWithdrawalSignature);
    vm.prank(worker);
    fund.refund();

    for (uint256 i = 0; i < 2; i++) {
      (address funder, ) = _funder(i);
      assertEq(token.balanceOf(funder), FUNDER_BASE_AMOUNT - ((DEPO_AMOUNT * (i + 1)) / 2));
    }
  }

  //////////////////////
  // Helper Functions //
  //////////////////////

  function _fundAs(uint256 index, uint256 amount) internal {
    (address funder, uint256 funderPK) = _funder(index);
    bytes memory signature = _signAsRaw(token.hashPermit(funder, address(fund), amount, block.timestamp), funderPK);
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
