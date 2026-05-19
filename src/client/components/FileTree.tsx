import { useState, useEffect, useCallback } from 'react'
import { Folder, FolderOpen, FileText } from 'lucide-react'
import { api, type FileTreeNode } from '../api'
import { SpiceLevel } from './SpiceLevel'
import { useToast } from './Toast'

interface Props {
  onSelectFile: (path: string) => void
  selectedFile: string | null
}

type ChildrenMap = Map<string, FileTreeNode[]>

export function FileTree({ onSelectFile, selectedFile }: Props) {
  const toast = useToast()
  const [roots, setRoots] = useState<FileTreeNode[]>([])
  const [childrenMap, setChildrenMap] = useState<ChildrenMap>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loadingPath, setLoadingPath] = useState<Set<string>>(new Set())
  const [rootLoading, setRootLoading] = useState(true)

  useEffect(() => {
    setRootLoading(true)
    api.getFileTree().then(result => {
      if (result.ok) {
        setRoots(result.data)
      } else {
        toast.error(`파일 트리 로드 실패: ${result.error}`)
      }
      setRootLoading(false)
    })
  }, [toast])

  const loadChildren = useCallback(async (dirPath: string) => {
    if (childrenMap.has(dirPath) || loadingPath.has(dirPath)) return
    setLoadingPath(prev => new Set(prev).add(dirPath))
    const result = await api.getDirectoryChildren(dirPath)
    setLoadingPath(prev => {
      const next = new Set(prev)
      next.delete(dirPath)
      return next
    })
    if (result.ok) {
      setChildrenMap(prev => {
        const next = new Map(prev)
        next.set(dirPath, result.data)
        return next
      })
    } else {
      toast.error(`디렉터리 펼치기 실패: ${result.error}`)
    }
  }, [childrenMap, loadingPath, toast])

  const toggleDir = useCallback((node: FileTreeNode) => {
    const path = node.path
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
        // expand 시점에 lazy load
        if (!childrenMap.has(path)) {
          loadChildren(path)
        }
      }
      return next
    })
  }, [childrenMap, loadChildren])

  const renderNode = (node: FileTreeNode, depth: number = 0) => {
    const isDir = node.type === 'directory'
    const isExpanded = expanded.has(node.path)
    const isSelected = node.path === selectedFile
    const isLoading = loadingPath.has(node.path)
    const children = childrenMap.get(node.path)

    return (
      <div key={node.path}>
        <div
          className={`file-tree-item ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onClick={() => {
            if (isDir) toggleDir(node)
            else onSelectFile(node.path)
          }}
        >
          <span className="icon" style={{ display: 'inline-flex', alignItems: 'center', color: isDir ? 'var(--peach)' : 'var(--text-muted)' }}>
            {isDir ? (isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />) : <FileText size={14} />}
          </span>
          <span className="name">{node.name}</span>
          {!isDir && <SpiceLevel path={node.path} />}
          {isLoading && (
            <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1 }} />
          )}
        </div>
        {isDir && isExpanded && children && children.map(c => renderNode(c, depth + 1))}
        {isDir && isExpanded && !children && !isLoading && (
          <div style={{ paddingLeft: 12 + (depth + 1) * 16, fontSize: 10, color: 'var(--text-muted)' }}>
            (비어있음)
          </div>
        )}
      </div>
    )
  }

  if (rootLoading) {
    return <div className="loading"><span className="spinner" /> Loading...</div>
  }

  if (roots.length === 0) {
    return <div className="loading">파일이 없습니다</div>
  }

  return <div>{roots.map(node => renderNode(node))}</div>
}