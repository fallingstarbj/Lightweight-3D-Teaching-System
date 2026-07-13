import type { AssetFile } from '../types'
import { toLocalUrl } from '../utils/localFile'
import PreviewPdfViewer from './PreviewPdfViewer'

interface DocumentPreviewProps {
  asset: AssetFile
}

export default function DocumentPreview({ asset }: DocumentPreviewProps): JSX.Element {
  return (
    <div className="preview-document-fullscreen">
      <PreviewPdfViewer url={toLocalUrl(asset.path)} title={asset.name} />
    </div>
  )
}
