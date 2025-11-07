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
uint256 constant TOKEN_SUPPLY = 1e9 * 10 ** TOKEN_DECIMALS;

// solc-ignore-next-line code-size
contract FundToken is ERC20, ERC20Permit {
  bytes32 private constant PERMIT_TYPEHASH =
      keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

  constructor() ERC20(TOKEN_NAME, TOKEN_SYMBOL) ERC20Permit(TOKEN_NAME) {
    _mint(msg.sender, TOKEN_SUPPLY);
  }

  function hashPermit(
    address owner,
    address spender,
    uint256 value,
    uint256 deadline
  ) external virtual returns (bytes32) {
    bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces(owner), deadline));
    bytes32 hash = _hashTypedDataV4(structHash);
    return hash;
  }
}

contract FundTest is Test {
  uint256 constant WORKER_PK = 1;
  uint256 constant ORACLE_PK = 2;
  uint256 constant FUNDER_PK = 3;
  uint256 constant FUNDER2_PK = 4;

  uint256 constant FUND_CUT = 1e3; // 10%
  bytes32 constant FUND_TERMS = bytes32(uint256(100));
  bytes32 constant BAD_TERMS = bytes32(uint256(101));
  uint256 constant DEPO_AMOUNT = 1e1 * 10 ** TOKEN_DECIMALS;
  uint256 constant DEPO_CUT = 1e0 * 10 ** TOKEN_DECIMALS;

  Fund fund;
  FundToken token;

  address worker;
  address oracle;
  address funder;
  address funder2;

  //////////////////////
  // Set Up/Tear Down //
  //////////////////////

  function setUp() public {
    worker = vm.addr(WORKER_PK);
    oracle = vm.addr(ORACLE_PK);
    funder = vm.addr(FUNDER_PK);
    funder2 = vm.addr(FUNDER2_PK);

    vm.prank(funder);
    token = new FundToken();

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
    bytes memory funderDepositSignature = _signAsRaw(
      token.hashPermit(funder, address(fund), DEPO_AMOUNT, block.timestamp),
      FUNDER_PK
    );
    fund.deposit(token, funder, DEPO_AMOUNT, funderDepositSignature);
    _;
  }

  modifier funded2() {
    vm.prank(funder);
    token.transfer(funder2, DEPO_AMOUNT);
    address[2] memory funders = [funder, funder2];
    uint256[2] memory pks = [FUNDER_PK, FUNDER2_PK];
    for (uint256 i = 0; i < funders.length; i++) {
      fund.deposit(
        token,
        funders[i],
        DEPO_AMOUNT,
        _signAsRaw(token.hashPermit(funders[i], address(fund), DEPO_AMOUNT, block.timestamp), pks[i])
      );
    }
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
    bytes32 permitHash = token.hashPermit(funder, address(fund), DEPO_AMOUNT, block.timestamp);
    bytes memory funderDepositSignature = _signAsRaw(permitHash, FUNDER_PK);

    vm.expectEmit();
    emit Fund.Deposit(token, funder, DEPO_AMOUNT);
    fund.deposit(token, funder, DEPO_AMOUNT, funderDepositSignature);

    assertEq(token.balanceOf(funder), TOKEN_SUPPLY - DEPO_AMOUNT);
    assertEq(fund.funds(), DEPO_AMOUNT);
  }

  function test_deposit_badPermit() public locked {
    bytes memory funderDepositSignature = _signAsRaw(BAD_TERMS, FUNDER_PK);
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
    uint256 snapshot = vm.snapshotState();
    address[2] memory managers = [worker, oracle];
    for (uint256 i = 0; i < managers.length; i++) {
      vm.revertToState(snapshot);
      vm.prank(managers[i]);
      fund.refund();
      assertEq(token.balanceOf(funder), TOKEN_SUPPLY);
    }
  }

  function test_refund_multiDonor() public locked funded2 {
    vm.prank(worker);
    fund.refund();
    assertEq(token.balanceOf(funder), TOKEN_SUPPLY - DEPO_AMOUNT);
    assertEq(token.balanceOf(funder2), DEPO_AMOUNT);
  }

  //////////////////////
  // Helper Functions //
  //////////////////////

  function _signAs191(bytes32 data, uint256 pk) internal pure returns (bytes memory signature) {
    bytes32 hash = MessageHashUtils.toEthSignedMessageHash(data);
    return _signAsRaw(hash, pk);
  }

  function _signAsRaw(bytes32 data, uint256 pk) internal pure returns (bytes memory signature) {
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, data);
    return abi.encodePacked(r, s, v);
  }
}
