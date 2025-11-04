# `re-fund` Contracts

## Usage

### Running Tests

To run all the tests in the project, execute the following command:

```shell
npx hardhat test
```

You can also selectively run the Solidity or `node:test` tests:

```shell
npx hardhat test solidity
npx hardhat test nodejs
```

### Deploying Contracts

This project includes an example Ignition module to deploy the contract. You
can deploy this module to a locally simulated chain or to Sepolia.

To run the deployment to a local chain:

```shell
npx hardhat ignition deploy ignition/modules/Counter.ts
```

To run the deployment to Sepolia:

```shell
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat ignition deploy --network sepolia ignition/modules/Counter.ts
```

Then, optionally to verify it on Etherscan:

```shell
npx hardhat keystore set ETHERSCAN_API_KEY
npx hardhat ignition verify --network sepolia chain-11155111
npx hardhat ignition deploy --verify --network sepolia ignition/modules/Counter.ts
```
