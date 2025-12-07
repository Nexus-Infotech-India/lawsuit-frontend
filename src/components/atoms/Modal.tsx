export default function Modal({ children, open }: { children: React.ReactNode, open: boolean }) {
  if (open) {
    return (
      <div className="absolute w-screen h-screen bg-[#0000003b] top-0 left-0 z-50 flex justify-center items-center fade" role="dialog" aria-modal="true" aria-labelledby="Search Modal" aria-describedby="Search something, anything find everything">
        <div className="bg-white rounded-lg overflow-hidden pop flex justify-between flex-col">
          {children}
        </div>
      </div>
    )
  }
}