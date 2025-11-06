'use client'

import { useState, useEffect } from 'react'
import { pinata } from '@/config'
import { verifiedFetch } from '@helia/verified-fetch'

export const Pinata = () => {
  const [files, setFiles] = useState(undefined);

  useEffect(() => {
    // pinata.gateways.public.get(
    //   "bafkreic5cej2fy5adiuz2w5xsxcmxlj723zeyz74f4xpj7wrgzxwnmqo3i"
    // ).then(({data, contentType}) => {
    //   console.log(data);
    //   console.log(contentType);
    // });
    pinata.files.public.list().then(myFiles => setFiles(myFiles));
  }, []);

  return (
    <div>
      {(files === undefined) ? (
        <p>
          Loading...
        </p>
      ) : (
        <ul>
          {(files?.files ?? []).map(({name, cid}) => (
            <li key={cid}>
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
