import * as fs from "fs";

const DEPLOYMENTS_DIR = "./ignition/deployments";
const ARTIFACTS_DIR = "./artifacts";
const TARGET_DIR = "../dapp/chain/";

function getDirectories(path: string) {
  return fs
    .readdirSync(path, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

function getContractNames(path: string) {
  return fs
    .readdirSync(path, { withFileTypes: true })
    .filter(dirent => dirent.isFile() && dirent.name.endsWith(".json"))
    .map(dirent => dirent.name.split(".")[0]);
}

function getActualSourcesForContract(sources: Record<string, any>, contractName: string) {
  for (const sourcePath of Object.keys(sources)) {
    const sourceName = sourcePath.split("/").pop()?.split(".sol")[0];
    if (sourceName === contractName) {
      const contractContent = sources[sourcePath].content as string;
      const regex = /contract\s+(\w+)\s+is\s+([^{}]+)\{/;
      const match = contractContent.match(regex);

      if (match) {
        const inheritancePart = match[2];
        // Split the inherited contracts by commas to get the list of inherited contracts
        const inheritedContracts = inheritancePart.split(",").map(contract => `${contract.trim()}.sol`);

        return inheritedContracts;
      }
      return [];
    }
  }
  return [];
}

function getInheritedFunctions(sources: Record<string, any>, contractName: string) {
  const actualSources = getActualSourcesForContract(sources, contractName);
  const inheritedFunctions = {} as Record<string, any>;

  for (const sourceContractName of actualSources) {
    const sourcePath = Object.keys(sources).find(key => key.includes(`/${sourceContractName}`));
    if (sourcePath) {
      const sourceName = sourcePath?.split("/").pop()?.split(".sol")[0];
      const { abi } = JSON.parse(fs.readFileSync(`${ARTIFACTS_DIR}/${sourcePath}/${sourceName}.json`).toString());
      for (const functionAbi of abi) {
        if (functionAbi.type === "function") {
          inheritedFunctions[functionAbi.name] = sourcePath;
        }
      }
    }
  }

  return inheritedFunctions;
}

function getContractDataFromDeployments() {
  if (!fs.existsSync(DEPLOYMENTS_DIR)) {
    throw Error("At least one other deployment script should exist to generate an actual contract.");
  }
  const output = {} as Record<string, any>;
  const chainDirectories = getDirectories(DEPLOYMENTS_DIR);
  for (const chainName of chainDirectories) {
    let chainId; {
      const match = chainName.match(/chain-(?<id>\d+)/);
      if (!match) {
        console.log(`No chainId file found for ${chainName}`);
        continue;
      } else {
        chainId = match.groups.id;
      }
    }

    const addresses = JSON.parse(
      fs.readFileSync(`${DEPLOYMENTS_DIR}/${chainName}/deployed_addresses.json`).toString(),
    );
    const contracts = {} as Record<string, any>;
    for (const contractName of getContractNames(`${DEPLOYMENTS_DIR}/${chainName}/artifacts`)) {
      const address = addresses[contractName];
      const { abi, metadata } = JSON.parse(
        fs.readFileSync(`${DEPLOYMENTS_DIR}/${chainName}/artifacts/${contractName}.json`).toString(),
      );
      const inheritedFunctions = metadata ? getInheritedFunctions(JSON.parse(metadata).sources, contractName) : {};
      let shortName = contractName; {
        const match = contractName.match(/\S+#(?<name>\S+)$/);
        if (!!match) {
          shortName = match.groups.name;
        }
      }
      contracts[shortName] = { address, abi, inheritedFunctions };
    }
    output[chainId] = contracts;
  }
  return output;
}

export default async function syncAbis() {
  const allContractsData = getContractDataFromDeployments();

  const fileContent = Object.entries(allContractsData).reduce((content, [chainId, chainConfig]) => {
    return `${content}${parseInt(chainId).toFixed(0)}:${JSON.stringify(chainConfig, null, 2)},`;
  }, "");

  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR);
  }
  fs.writeFileSync(
    `${TARGET_DIR}contracts.ts`,
    `const CONTRACTS = {${fileContent}} as const;\nexport default CONTRACTS;`,
  );

  console.log(`📝 Updated TypeScript contract definition file: ${TARGET_DIR}contracts.ts`);
};

await syncAbis();
