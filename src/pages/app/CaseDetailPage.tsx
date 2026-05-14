import { FC, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CaseInfo from '@/components/atoms/CaseInfo'
import CaseTimeline from '@/components/atoms/CaseTimeline'
import CaseHearings from '@/components/atoms/CaseHearings'
import DocumentsTab from '@/components/atoms/DocumentsTab'
import TasksTab from '@/components/atoms/TasksTab'
import { casesApi } from '@/services/api'

type TabKey = 'caseInfo' | 'timeline' | 'hearings' | 'chat' | 'documents' | 'tasks'

const CaseDetailPage: FC = () => {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  // Default to caseInfo now that chat redirects elsewhere — landing on the
  // chat tab would just bounce the user immediately.
  const [selectedTab, setSelectedTab] = useState<TabKey>('caseInfo')
  const [caseData, setCaseData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      try {
        if (caseId) {
          const res = await casesApi.getById(caseId)
          const data = (res as any).data?.data ?? (res as any).data ?? res
          setCaseData(data)
        }
      } catch (err) {
        console.warn('Failed to load case', err)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [caseId])

  const renderTab = () => {
    const id = caseId ?? 'unknown'
    switch (selectedTab) {
      case 'caseInfo':
        return <CaseInfo caseId={id} />
      case 'timeline':
        // Server-backed now — `caseData?.timeline` is read directly from the
        // server via React Query inside CaseTimeline; the prop is unused.
        return <CaseTimeline caseId={id} />
      case 'hearings':
        return <CaseHearings caseId={id} />
      // 'chat' is handled by an onClick redirect in the tab list below; this
      // case is unreachable in practice but kept for type exhaustiveness.
      case 'chat':
        return null
      case 'documents':
        return <DocumentsTab caseId={id} />
      case 'tasks':
        return <TasksTab caseId={id} initial={caseData?.tasks ?? []} />
      default:
        return null
    }
  }

  return (
    <div className="max-w-6xl mx-auto py-8">
      <h1 className="text-2xl font-semibold mb-6">Case Detail</h1>
      {loading ? (
        <div className="text-gray-600">Loading case…</div>
      ) : (
        <div className="flex gap-6 items-stretch min-h-[60vh]">
          {/* Left column 40% */}
          <div className="w-[40%] flex flex-col border rounded-md overflow-hidden">
            {/* Top: Advocate image + name */}
            <div className="p-4 bg-white border-b">
              <div className="flex flex-col items-center">
                <div className="w-28 h-28  bg-gray-200 overflow-hidden flex items-center justify-center">
                  {caseData?.lawyer?.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={caseData.lawyer.avatar} alt={caseData.lawyer.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-gray-500">No Image</div>
                  )}
                </div>
                <div className="mt-3 text-center">
                  <div className="font-semibold text-lg">{caseData?.lawyer?.name ?? 'Advocate Name'}</div>
                  <div className="text-sm text-gray-500">{caseData?.lawyer?.location ?? ''}</div>
                </div>
              </div>
            </div>

            {/* Bottom: Tabs list vertical */}
            <div className="bg-gray-50 p-3 flex-1 overflow-auto">
              <div className="space-y-2">
                {(
                  [
                    { key: 'caseInfo', label: 'Case Info' },
                    { key: 'timeline', label: 'Case Timeline' },
                    { key: 'hearings', label: 'Case Hearings' },
                    { key: 'chat', label: 'Chat' },
                    { key: 'documents', label: 'Documents' },
                    { key: 'tasks', label: 'Tasks' },
                  ] as { key: TabKey; label: string }[]
                ).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      // Chat tab redirects to the unified chat page with
                      // this case's lawyer pre-opened.
                      if (t.key === 'chat') {
                        const lawyerId = caseData?.lawyer?.id ?? caseData?.lawyerId
                        if (lawyerId && caseId) {
                          navigate(`/app/chats?with=${lawyerId}&caseId=${caseId}`)
                        } else {
                          navigate('/app/chats')
                        }
                        return
                      }
                      setSelectedTab(t.key)
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md ${selectedTab === t.key ? 'bg-white border shadow-sm' : 'hover:bg-gray-100'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right column 60% */}
          <div className="w-[60%] flex flex-col">
            <div className="bg-white p-4 border mb-4 rounded-md">
              <div className="text-sm text-gray-500">Case ID</div>
              <div className="text-xl font-semibold">{caseData?.id ?? caseId}</div>
            </div>

            <div className="bg-white rounded-md border flex-1 overflow-auto">
              <div className="h-full">{renderTab()}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CaseDetailPage