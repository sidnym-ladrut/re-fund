// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {FundBaseTest} from "./FundBaseTest.sol";
import {IFund} from "../contracts/IFund.sol";
import {Fund} from "../contracts/Fund.sol";
import {FUND_TOKEN_DECIMALS} from "../contracts/FundToken.sol";

// solc-ignore-next-line code-size
contract FundTest is FundBaseTest {
  ///////////////
  // Constants //
  ///////////////

  bytes32 public constant FUND_TERMS = bytes32(uint256(1000));
  bytes32 public constant BAD_TERMS = bytes32(uint256(1001));
  uint256 public constant ORACLE_CUT = 1e0 * 10 ** FUND_TOKEN_DECIMALS;

  ///////////////
  // Modifiers //
  ///////////////

  modifier locked() {
    bytes memory signature = _signAs191(_oracle(), FUND_TERMS);
    vm.prank(_worker());
    _fund().lockTerms(signature);
    _;
  }

  modifier fundedBy(uint256 n) {
    require(n <= PERROLE_COUNT);
    for (uint256 i = 0; i < n; i++) {
      _fundAs(_fund(), _funders[i], (i + 1) * DEPO_AMOUNT);
    }
    _;
  }

  //////////////////////
  // Set Up/Tear Down //
  //////////////////////

  function setUp() public override {
    super.setUp();

    bytes memory fundArgs = abi.encode(_worker(), _oracle(), FUND_CUT, _fundToken, FUND_TERMS);
    vm.prank(_worker());
    _funds.push(Fund(_fundFactory.deploy(fundArgs)));
  }

  ////////////////////
  // Test Functions //
  ////////////////////

  function test_initialize_success() public view {
    assertEq(_fund().worker(), _worker());
    assertEq(_fund().worker(), _fund().owner());
    assertEq(_fund().oracle(), _oracle());

    assertEq(_fund().oracleCut(), FUND_CUT);
    assertEq(_fund().termsCID(), FUND_TERMS);
    assertEq(address(_fund().payoutToken()), address(_fundToken));
  }

  function test_lockTerms_success() public {
    bytes memory oracleTermsSignature = _signAs191(_oracle(), FUND_TERMS);
    vm.prank(_worker());
    _fund().lockTerms(oracleTermsSignature);
    assertEq(_fund().termsSignature(), oracleTermsSignature);
  }

  function test_lockTerms_badSigner() public {
    bytes memory workerTermsSignature = _signAs191(_worker(), FUND_TERMS);
    vm.prank(_worker());
    vm.expectRevert();
    _fund().lockTerms(workerTermsSignature);
  }

  function test_lockTerms_badMessage() public {
    bytes memory oracleRandomSignature = _signAs191(_oracle(), BAD_TERMS);
    vm.prank(_worker());
    vm.expectRevert();
    _fund().lockTerms(oracleRandomSignature);
  }

  function test_lockTerms_postLock() public locked {
    bytes memory oracleTermsSignature = _signAs191(_oracle(), FUND_TERMS);
    vm.prank(_worker());
    vm.expectRevert();
    _fund().lockTerms(oracleTermsSignature);
    vm.prank(_worker());
    vm.expectRevert();
    _fund().updateTerms(FUND_CUT, _fundToken, BAD_TERMS);
  }

  function test_deposit_success() public locked {
    bytes32 permitHash = _fundToken.hashPermit(_funder(), address(_fund()), DEPO_AMOUNT, block.timestamp);
    bytes memory funderDepositSignature = _signAsRaw(_funder(), permitHash);

    vm.prank(_funder());
    vm.expectEmit();
    emit IFund.Deposit(_fundToken, _funder(), DEPO_AMOUNT);
    _fund().deposit(_fundToken, _funder(), DEPO_AMOUNT, funderDepositSignature);

    assertEq(_fundToken.balanceOf(_funder()), FUNDER_BASE_AMOUNT - DEPO_AMOUNT);
    assertEq(_fund().funds(), DEPO_AMOUNT);
  }

  function test_deposit_badPermit() public locked {
    bytes memory funderDepositSignature = _signAsRaw(_funder(), BAD_TERMS);
    vm.expectRevert();
    _fund().deposit(_fundToken, _funder(), DEPO_AMOUNT, funderDepositSignature);
  }

  function test_withdraw_success() public locked fundedBy(1) {
    bytes memory oracleWithdrawalSignature = _signAsRaw(_oracle(), _fund().hashWithdraw(DEPO_AMOUNT));

    vm.prank(_worker());
    vm.expectEmit();
    emit IFund.Withdrawal(DEPO_AMOUNT);
    _fund().withdraw(DEPO_AMOUNT, oracleWithdrawalSignature);

    assertEq(_fundToken.balanceOf(_worker()), DEPO_AMOUNT - ORACLE_CUT);
    assertEq(_fundToken.balanceOf(_oracle()), ORACLE_CUT);
    assertEq(_fundToken.balanceOf(address(_fund())), 0);
  }

  function test_withdraw_badSigner() public locked fundedBy(1) {
    bytes memory workerWithdrawalSignature = _signAsRaw(_worker(), _fund().hashWithdraw(DEPO_AMOUNT));
    vm.prank(_worker());
    vm.expectRevert();
    _fund().withdraw(DEPO_AMOUNT, workerWithdrawalSignature);
  }

  function test_withdraw_badMessage() public locked fundedBy(1) {
    bytes memory oracleRandomSignature = _signAs191(_oracle(), BAD_TERMS);
    vm.prank(_worker());
    vm.expectRevert();
    _fund().withdraw(DEPO_AMOUNT, oracleRandomSignature);
  }

  function test_withdraw_badAmount() public locked fundedBy(1) {
    bytes memory oracleRealWithdrawalSignature = _signAsRaw(_oracle(), _fund().hashWithdraw(DEPO_AMOUNT));
    bytes memory oracleZeroWithdrawalSignature = _signAsRaw(_oracle(), _fund().hashWithdraw(0));

    vm.prank(_worker());
    vm.expectRevert();
    _fund().withdraw(DEPO_AMOUNT + 1, oracleRealWithdrawalSignature);

    vm.prank(_worker());
    vm.expectRevert();
    _fund().withdraw(DEPO_AMOUNT - 1, oracleRealWithdrawalSignature);

    vm.prank(_worker());
    vm.expectRevert();
    _fund().withdraw(0, oracleZeroWithdrawalSignature);
  }

  function test_refund_uniDonor() public locked fundedBy(1) {
    uint256 snapshot = vm.snapshotState();
    address[2] memory managers = [_worker(), _oracle()];
    for (uint256 i = 0; i < managers.length; i++) {
      vm.revertToState(snapshot);
      vm.prank(managers[i]);
      vm.expectEmit();
      emit IFund.Refund(managers[i], DEPO_AMOUNT);
      _fund().refund();

      assertEq(_fundToken.balanceOf(address(_fund())), 0);
      assertEq(_fundToken.balanceOf(_funder()), FUNDER_BASE_AMOUNT);
    }
  }

  function test_refund_multiDonor_basic() public locked fundedBy(2) {
    vm.prank(_worker());
    vm.expectEmit();
    emit IFund.Refund(_worker(), 3 * DEPO_AMOUNT);
    _fund().refund();

    assertEq(_fundToken.balanceOf(address(_fund())), 0);
    for (uint256 i = 0; i < 2; i++) {
      assertEq(_fundToken.balanceOf(_funders[i]), FUNDER_BASE_AMOUNT);
    }
  }

  function test_refund_multiDonor_complex() public locked fundedBy(2) {
    uint256 withdrawAmount = _fund().funds() / 2;
    bytes memory oracleWithdrawalSignature = _signAsRaw(_oracle(), _fund().hashWithdraw(withdrawAmount));
    vm.prank(_worker());
    _fund().withdraw(withdrawAmount, oracleWithdrawalSignature);
    vm.prank(_worker());
    _fund().refund();

    for (uint256 i = 0; i < 2; i++) {
      assertEq(_fundToken.balanceOf(_funders[i]), FUNDER_BASE_AMOUNT - ((DEPO_AMOUNT * (i + 1)) / 2));
    }
  }

  //////////////////////
  // Helper Functions //
  //////////////////////

  function _worker() internal view returns (address) { return _workers[0]; }
  function _oracle() internal view returns (address) { return _oracles[0]; }
  function _funder() internal view returns (address) { return _funders[0]; }
  function _fund() internal view returns (Fund) { return _funds[0]; }
}
