// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

// import {console} from "forge-std/console.sol";
import {FundBaseTest} from "./FundBaseTest.sol";
import {IFund} from "../contracts/IFund.sol";
import {Fund} from "../contracts/Fund.sol";
import {FUND_TOKEN_DECIMALS} from "../contracts/FundToken.sol";

// solc-ignore-next-line code-size
contract FundTest is FundBaseTest {
  ///////////////
  // Constants //
  ///////////////

  string public constant FUND_TERMS = "bafkreie7525ywkhwglluidqr3ule3jsd22bfyfs7yx6jgtlc3v34enosji";
  bytes32 public constant BAD_TERMS_HASH = bytes32(uint256(0));
  uint256 public constant ORACLE_CUT = 1e0 * 10 ** FUND_TOKEN_DECIMALS;

  ///////////////
  // Modifiers //
  ///////////////

  modifier locked() {
    bytes memory signature = _signAs(_oracle(), _fund().hashSignTerms());
    vm.prank(_worker());
    _fund().lockTerms(signature);
    _;
  }

  modifier fundedBy(uint256 count) {
    require(count <= PERROLE_COUNT);
    for (uint256 i = 0; i < count; i++) {
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
    assertEq(uint8(_fund().status()), uint8(IFund.Status.Pending));

    assertEq(_fund().oracleCut(), FUND_CUT);
    assertEq(_fund().terms(), FUND_TERMS);
    assertEq(address(_fund().payoutToken()), address(_fundToken));
  }

  function test_lockTerms_success() public {
    bytes memory oracleTermsSignature = _signAs(_oracle(), _fund().hashSignTerms());
    vm.prank(_worker());
    _fund().lockTerms(oracleTermsSignature);
    assertEq(_fund().termsSignature(), oracleTermsSignature);
    assertEq(uint8(_fund().status()), uint8(IFund.Status.Active));
  }

  function test_lockTerms_badSigner() public {
    bytes memory workerTermsSignature = _signAs(_worker(), _fund().hashSignTerms());
    vm.prank(_worker());
    vm.expectRevert();
    _fund().lockTerms(workerTermsSignature);
  }

  function test_lockTerms_badMessage() public {
    bytes memory oracleRandomSignature = _signAs(_oracle(), BAD_TERMS_HASH);
    vm.prank(_worker());
    vm.expectRevert();
    _fund().lockTerms(oracleRandomSignature);
  }

  function test_lockTerms_postLock() public locked {
    bytes memory oracleTermsSignature = _signAs(_oracle(), _fund().hashSignTerms());
    vm.prank(_worker());
    vm.expectRevert();
    _fund().lockTerms(oracleTermsSignature);
    vm.prank(_worker());
    vm.expectRevert();
    _fund().updateTerms(FUND_CUT, _fundToken, "QmNezRZBYa6EZjx7346rvGmUhxPocNqEpP7YvpdYmytbW5");
  }

  function test_deposit_success() public locked {
    bytes32 permitHash = _fundToken.hashPermit(_funder(), address(_fund()), DEPO_AMOUNT, BLOCK_PERMIT_TIME);
    bytes memory funderDepositSignature = _signAs(_funder(), permitHash);

    vm.prank(_funder());
    vm.expectEmit();
    emit IFund.Deposit(_fundToken, _funder(), DEPO_AMOUNT);
    _fund().deposit(_fundToken, _funder(), DEPO_AMOUNT, BLOCK_PERMIT_TIME, funderDepositSignature);

    assertEq(_fundToken.balanceOf(_funder()), FUNDER_BASE_AMOUNT - DEPO_AMOUNT);
    assertEq(_fund().funds(), DEPO_AMOUNT);
    assertEq(uint8(_fund().status()), uint8(IFund.Status.Active));
  }

  function test_deposit_badPermit() public locked {
    bytes memory funderDepositSignature = _signAs(_funder(), BAD_TERMS_HASH);
    vm.expectRevert();
    _fund().deposit(_fundToken, _funder(), DEPO_AMOUNT, BLOCK_PERMIT_TIME, funderDepositSignature);
  }

  function test_withdraw_success() public locked fundedBy(1) {
    bytes memory oracleWithdrawalSignature = _signAs(_oracle(), _fund().hashWithdraw(DEPO_AMOUNT));

    vm.prank(_worker());
    vm.expectEmit();
    emit IFund.Withdrawal(DEPO_AMOUNT);
    _fund().withdraw(DEPO_AMOUNT, oracleWithdrawalSignature);

    assertEq(_fundToken.balanceOf(_worker()), DEPO_AMOUNT - ORACLE_CUT);
    assertEq(_fundToken.balanceOf(_oracle()), ORACLE_CUT);
    assertEq(_fundToken.balanceOf(address(_fund())), 0);
    assertEq(uint8(_fund().status()), uint8(IFund.Status.Active));
  }

  function test_withdraw_badSigner() public locked fundedBy(1) {
    bytes memory workerWithdrawalSignature = _signAs(_worker(), _fund().hashWithdraw(DEPO_AMOUNT));
    vm.prank(_worker());
    vm.expectRevert();
    _fund().withdraw(DEPO_AMOUNT, workerWithdrawalSignature);
  }

  function test_withdraw_badMessage() public locked fundedBy(1) {
    bytes memory oracleRandomSignature = _signAs(_oracle(), BAD_TERMS_HASH);
    vm.prank(_worker());
    vm.expectRevert();
    _fund().withdraw(DEPO_AMOUNT, oracleRandomSignature);
  }

  function test_withdraw_badAmount() public locked fundedBy(1) {
    bytes memory oracleRealWithdrawalSignature = _signAs(_oracle(), _fund().hashWithdraw(DEPO_AMOUNT));
    bytes memory oracleZeroWithdrawalSignature = _signAs(_oracle(), _fund().hashWithdraw(0));

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
    assertEq(uint8(_fund().status()), uint8(IFund.Status.Active));
  }

  function test_refund_multiDonor_noWithdraw() public locked fundedBy(2) {
    vm.prank(_worker());
    vm.expectEmit();
    emit IFund.Refund(_worker(), 3 * DEPO_AMOUNT);
    _fund().refund();

    assertEq(_fundToken.balanceOf(address(_fund())), 0);
    for (uint256 i = 0; i < 2; i++) {
      assertEq(_fundToken.balanceOf(_funders[i]), FUNDER_BASE_AMOUNT);
    }
    assertEq(uint8(_fund().status()), uint8(IFund.Status.Active));
  }

  function test_refund_multiDonor_oneWithdraw() public locked fundedBy(2) {
    _withdrawFrom(_fund(), _fund().funds() / 2);
    _refundAs(_fund(), _worker());

    assertEq(_fundToken.balanceOf(address(_fund())), 0);
    for (uint256 i = 0; i < 2; i++) {
      assertEq(_fundToken.balanceOf(_funders[i]), FUNDER_BASE_AMOUNT - ((DEPO_AMOUNT * (i + 1)) / 2));
    }
  }

  function test_refund_multiDonor_multiWithdraw() public locked fundedBy(2) {
    _refundAs(_fund(), _worker());
    _fundAs(_fund(), _funders[2], 3 * DEPO_AMOUNT);
    _withdrawFrom(_fund(), _fund().funds() / 2);
    _refundAs(_fund(), _oracle());

    assertEq(_fundToken.balanceOf(address(_fund())), 0);
    for (uint256 i = 0; i < 2; i++) {
      assertEq(_fundToken.balanceOf(_funders[i]), FUNDER_BASE_AMOUNT);
    }
    for (uint256 i = 2; i < 3; i++) {
      assertEq(_fundToken.balanceOf(_funders[i]), FUNDER_BASE_AMOUNT - ((DEPO_AMOUNT * (i + 1)) / 2));
    }
  }

  function test_close_success() public locked fundedBy(1) {
    uint256 snapshot = vm.snapshotState();
    address[2] memory managers = [_worker(), _oracle()];
    for (uint256 i = 0; i < managers.length; i++) {
      vm.revertToState(snapshot);
      _closeAs(_fund(), managers[i]);

      assertEq(_fundToken.balanceOf(address(_fund())), DEPO_AMOUNT);
      assertEq(_fundToken.balanceOf(_funder()), FUNDER_BASE_AMOUNT - DEPO_AMOUNT);
      assertEq(uint8(_fund().status()), uint8(IFund.Status.Closed));
    }
  }

  function test_close_badCaller() public locked fundedBy(1) {
    vm.prank(_funder());
    vm.expectRevert();
    _fund().close();
  }

  function test_close_postClose() public locked fundedBy(1) {
    _closeAs(_fund(), _worker());

    vm.prank(_worker());
    vm.expectRevert();
    _fund().close();

    Fund fund = _fund();
    address[3] memory funders = [_funder(), _worker(), _oracle()];
    for (uint256 i = 0; i < funders.length; i++) {
      address funder = funders[i];
      bytes32 hashPermit = _fundToken.hashPermit(funder, address(fund), DEPO_AMOUNT, BLOCK_PERMIT_TIME);
      bytes memory signature = _signAs(funder, hashPermit);
      vm.prank(funder);
      vm.expectRevert();
      fund.deposit(_fundToken, funder, DEPO_AMOUNT, BLOCK_PERMIT_TIME, signature);
    }

    _withdrawFrom(_fund(), _fund().funds() / 2);
    _refundAs(_fund(), _oracle());
    assertEq(uint8(_fund().status()), uint8(IFund.Status.Closed));
  }

  //////////////////////
  // Helper Functions //
  //////////////////////

  function _worker() internal view returns (address) { return _workers[0]; }
  function _oracle() internal view returns (address) { return _oracles[0]; }
  function _funder() internal view returns (address) { return _funders[0]; }
  function _fund() internal view returns (Fund) { return _funds[0]; }
}
