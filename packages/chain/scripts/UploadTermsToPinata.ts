import * as readline from 'readline';
import * as https from 'https';

const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT;
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL;

if (!PINATA_JWT || !PINATA_GATEWAY) {
  console.error('❌ Error: NEXT_PUBLIC_PINATA_JWT and NEXT_PUBLIC_GATEWAY_URL must be set in environment');
  console.error('   Run from dapp directory: cd ../dapp && source .env.local && cd ../chain');
  process.exit(1);
}

async function uploadToPinata(jsonData: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      pinataContent: jsonData,
      pinataMetadata: {
        name: `fund-terms-${Date.now()}.json`,
      },
    });

    const options = {
      hostname: 'api.pinata.cloud',
      path: '/pinning/pinJSONToIPFS',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PINATA_JWT}`,
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          const response = JSON.parse(responseData);
          resolve(response.IpfsHash);
        } else {
          reject(new Error(`Upload failed: ${res.statusCode} - ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('\n🎯 Fund Terms Uploader to Pinata IPFS\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  try {
    // Get terms type
    console.log('Select terms type:');
    console.log('1. Plain text terms');
    console.log('2. Milestones-based terms');
    const typeChoice = await question('Enter choice (1 or 2): ');

    if (typeChoice === '1') {
      // Plain text terms
      const title = await question('Enter title: ');
      const termsText = await question('Enter terms text: ');

      const termsJson = {
        schema: "fund-plaintext",
        version: 0,
        terms: { text: termsText },
      };

      console.log('\n📤 Uploading to Pinata...');
      const cid = await uploadToPinata(termsJson);
      
      console.log('\n✅ Upload successful!');
      console.log(`📎 CID: ${cid}`);
      console.log(`🔗 Gateway URL: https://${PINATA_GATEWAY}/ipfs/${cid}`);
      
    } else if (typeChoice === '2') {
      // Milestones-based terms
      const title = await question('Enter title: ');
      const summary = await question('Enter summary: ');
      const oracle = await question('Enter oracle address: ');
      const cut = await question('Enter oracle cut (basis points, e.g., 100 for 1%): ');
      
      const milestones = [];
      let addMore = true;
      let count = 1;
      
      while (addMore) {
        console.log(`\nMilestone ${count}:`);
        const terms = await question('  Terms: ');
        const target = await question('  Target amount (in wei): ');
        
        milestones.push({
          terms,
          target: target,
        });
        
        const more = await question('Add another milestone? (y/n): ');
        addMore = more.toLowerCase() === 'y';
        count++;
      }

      const termsJson = {
        schema: "fund-milestones",
        version: 0,
        meta: {
          title,
          summary,
          oracle,
          cut: parseInt(cut),
          milestones,
        },
      };

      console.log('\n📤 Uploading to Pinata...');
      const cid = await uploadToPinata(termsJson);
      
      console.log('\n✅ Upload successful!');
      console.log(`📎 CID: ${cid}`);
      console.log(`🔗 Gateway URL: https://${PINATA_GATEWAY}/ipfs/${cid}`);
      
    } else {
      console.log('❌ Invalid choice');
    }

  } catch (error) {
    console.error('\n❌ Upload failed:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main().catch(console.error);
