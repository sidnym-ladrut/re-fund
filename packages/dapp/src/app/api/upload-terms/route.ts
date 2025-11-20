import { NextRequest, NextResponse } from 'next/server';
import * as https from 'https';

const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT;

async function uploadToPinata(jsonData: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      pinataContent: jsonData,
      pinataMetadata: {
        name: `fund-terms-${Date.now()}.json`,
      },
    });

    console.log('Pinata request data:', data);
    console.log('Using JWT:', PINATA_JWT?.substring(0, 20) + '...');

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
        console.log('Pinata response status:', res.statusCode);
        console.log('Pinata response body:', responseData);
        
        if (res.statusCode === 200) {
          const response = JSON.parse(responseData);
          resolve(response.IpfsHash);
        } else {
          reject(new Error(`Upload failed: ${res.statusCode} - ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
    });
    
    req.write(data);
    req.end();
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { termsData } = body;
    
    if (!termsData) {
      return NextResponse.json(
        { error: 'No terms data provided' },
        { status: 400 }
      );
    }

    console.log('Uploading to Pinata:', termsData);
    const cid = await uploadToPinata(termsData);
    console.log('Upload successful, CID:', cid);
    
    return NextResponse.json({
      cid,
      success: true,
    });
  } catch (error) {
    console.error('Pinata upload error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to upload to IPFS', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}
