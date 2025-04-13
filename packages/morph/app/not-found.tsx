import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col justify-between min-h-screen bg-[#1a1a1a] text-[#CDC9B9] font-mono p-8">
      <div>
        <h1 className="text-8xl font-bold mb-4">overflow</h1>
        <div className="grid grid-rows-3 gap-x-4 my-6 text-sm">
          <span>ERROR 404</span><span>ERROR 404</span><span>ERROR 404</span>
        </div>
        <Link href="/vaults" className="text-sm uppercase hover:text-white transition-colors">
          return to vaults
        </Link>
      </div>
      <div className="text-xs">
        <p>#CDC9B9</p>
        <p>ERRORDAY 40:44:04</p>
        <p>ERROR</p>
        <p>ERROR</p>
        <p>ERROR@ERROR.ERROR</p>
      </div>
    </div>
  )
}
