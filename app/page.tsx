import Web3AuthNFTMinter from '@/components/Web3AuthNFTMinter';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-8 md:p-24">
      <div className="max-w-3xl w-full flex flex-col items-center gap-8">
        <div className="w-full flex justify-between items-center">
          <h1 className="text-4xl font-bold">Dog NFT Generator</h1>
          <Link href="/admin" className="text-sm px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-md transition-colors duration-200">
            Admin
          </Link>
        </div>
        <p className="text-lg text-center text-gray-700">
          Mint unique dog NFTs with your wallet or social login, then see them instantly generated with timestamps.
        </p>
        
        <Web3AuthNFTMinter />
      </div>
    </main>
  );
}
