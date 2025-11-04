# `re-fund` Features & User Stories

- As a user, I can connect a wallet to perform on-chain actions.

## Worker

- As a worker, I can propose a `fund` contract that specifies an oracle address
  (to review the work), an oracle cut (e.g. 2%), a target payout currency (e.g.
  `USDC`) and one or more milestones (i.e. target and terms (stored in IPFS)
  pairs).
- As a worker, I can view all of my created contracts.
- As a worker, I can arbitrarily edit all of my proposed contracts.
- As a worker, I can perform a milestone-associated withdraw from a locked
  contract that has been approved by the oracle.
- As a worker, I can withdraw any donations contained within a `fund` contract
  after all milestones have been completed without a prior oracle approval.
- As an worker, I can cancel a `fund` contract to release any existing donations
  to the associated funders.

## Oracle

- As an oracle, I can view all `fund` contracts that have requested me as a
  reviewer and that I'm actively reviewing.
- As an oracle, I can accept a proposed contract to lock it in.
- As an oracle, I can approve a milestone-associated withdrawal by the worker
  from a locked `fund` contract.
- As an oracle, I can cancel a `fund` contract to release any existing donations
  to the associated funders.

## Funder

- As a funder, I can enter a `fund` contract address to view its contents.
- As a funder, I can deposit any ERC20 token into a locked `fund` contract.
