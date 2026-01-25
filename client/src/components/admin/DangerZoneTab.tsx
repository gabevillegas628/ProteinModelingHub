import { useState } from 'react'
import * as adminApi from '../../services/adminApi'

type Step = 'initial' | 'preview' | 'download' | 'confirm' | 'complete'

export default function DangerZoneTab() {
  const [step, setStep] = useState<Step>('initial')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<adminApi.ResetPreview | null>(null)
  const [downloadConfirmed, setDownloadConfirmed] = useState(false)
  const [confirmationInput, setConfirmationInput] = useState('')
  const [result, setResult] = useState<adminApi.ResetResult | null>(null)

  const handleStartReset = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await adminApi.getResetPreview()
      setPreview(data)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get preview')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadArchive = async () => {
    try {
      setLoading(true)
      setError('')
      await adminApi.downloadArchive()
      setStep('download')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download archive')
    } finally {
      setLoading(false)
    }
  }

  const handleProceedToConfirm = () => {
    if (downloadConfirmed) {
      setStep('confirm')
    }
  }

  const handleExecuteReset = async () => {
    if (!preview || confirmationInput !== preview.confirmationCode) {
      setError('Confirmation code does not match')
      return
    }

    try {
      setLoading(true)
      setError('')
      const data = await adminApi.executeReset(confirmationInput)
      setResult(data)
      setStep('complete')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute reset')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setStep('initial')
    setPreview(null)
    setDownloadConfirmed(false)
    setConfirmationInput('')
    setResult(null)
    setError('')
  }

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-red-800">Danger Zone</h3>
            <p className="mt-1 text-sm text-red-700">
              The nuclear reset will permanently delete all student data, groups, submissions, messages, and literature.
              Only admin accounts, instructor accounts, and model templates will be preserved.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Step: Initial */}
      {step === 'initial' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Nuclear Reset</h3>
          <p className="text-gray-600 mb-6">
            Use this to prepare the system for a new program. This will archive all existing data
            and then reset the database to a clean state.
          </p>
          <button
            onClick={handleStartReset}
            disabled={loading}
            className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 disabled:bg-gray-400 transition-colors"
          >
            {loading ? 'Loading...' : 'Begin Reset Process'}
          </button>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && preview && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Step 1: Review What Will Be Deleted</h3>

          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Will be deleted */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-semibold text-red-800 mb-3">Will Be Deleted</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                  <span className="text-red-700">Groups:</span>
                  <span className="font-semibold text-red-900">{preview.toDelete.groups}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-red-700">Students:</span>
                  <span className="font-semibold text-red-900">{preview.toDelete.students}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-red-700">Submissions:</span>
                  <span className="font-semibold text-red-900">{preview.toDelete.submissions}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-red-700">Messages:</span>
                  <span className="font-semibold text-red-900">{preview.toDelete.messages}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-red-700">Literature:</span>
                  <span className="font-semibold text-red-900">{preview.toDelete.literature}</span>
                </li>
                <li className="flex justify-between border-t border-red-200 pt-2 mt-2">
                  <span className="text-red-700">Files on Disk:</span>
                  <span className="font-semibold text-red-900">{preview.toDelete.filesOnDisk}</span>
                </li>
              </ul>
            </div>

            {/* Will be preserved */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-green-800 mb-3">Will Be Preserved</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                  <span className="text-green-700">Admins:</span>
                  <span className="font-semibold text-green-900">{preview.toPreserve.admins}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-green-700">Instructors:</span>
                  <span className="font-semibold text-green-900">{preview.toPreserve.instructors}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-green-700">Model Templates:</span>
                  <span className="font-semibold text-green-900">{preview.toPreserve.modelTemplates}</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep('initial')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDownloadArchive}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Preparing Archive...' : 'Download Archive & Continue'}
            </button>
          </div>
        </div>
      )}

      {/* Step: Download Confirmation */}
      {step === 'download' && preview && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Step 2: Confirm Archive Download</h3>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800">
              The archive has been downloaded. Please verify that the ZIP file contains all the expected data
              before proceeding. Once you execute the reset, this data will be permanently deleted from the server.
            </p>
          </div>

          <label className="flex items-center gap-3 mb-6 cursor-pointer">
            <input
              type="checkbox"
              checked={downloadConfirmed}
              onChange={(e) => setDownloadConfirmed(e.target.checked)}
              className="w-5 h-5 text-red-600 border-gray-300 rounded focus:ring-red-500"
            />
            <span className="text-gray-700">
              I confirm that I have downloaded and verified the archive
            </span>
          </label>

          <div className="flex gap-4">
            <button
              onClick={() => setStep('preview')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleProceedToConfirm}
              disabled={!downloadConfirmed}
              className="bg-red-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Proceed to Final Confirmation
            </button>
          </div>
        </div>
      )}

      {/* Step: Final Confirmation */}
      {step === 'confirm' && preview && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Step 3: Final Confirmation</h3>

          <div className="bg-red-100 border-2 border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-semibold mb-2">
              This action is IRREVERSIBLE!
            </p>
            <p className="text-red-700 text-sm">
              Clicking the button below will permanently delete all groups, student accounts, submissions,
              messages, and literature files from the database and server.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 font-medium mb-2">
              Type the following code to confirm:
            </label>
            <code className="block bg-gray-100 px-4 py-2 rounded text-red-600 font-mono mb-3">
              {preview.confirmationCode}
            </code>
            <input
              type="text"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              placeholder="Enter confirmation code"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 font-mono"
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setStep('download')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleExecuteReset}
              disabled={loading || confirmationInput !== preview.confirmationCode}
              className="bg-red-600 text-white px-8 py-3 rounded-lg font-bold text-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Executing Reset...' : '☢️ EXECUTE NUCLEAR RESET'}
            </button>
          </div>
        </div>
      )}

      {/* Step: Complete */}
      {step === 'complete' && result && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900">Reset Complete</h3>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h4 className="font-semibold text-gray-800 mb-3">Summary of Deleted Data:</h4>
            <ul className="space-y-1 text-sm text-gray-600">
              <li>Groups: {result.deleted.groups}</li>
              <li>Students: {result.deleted.students}</li>
              <li>Submissions: {result.deleted.submissions}</li>
              <li>Messages: {result.deleted.messages}</li>
              <li>Literature: {result.deleted.literature}</li>
              <li>Files Removed: {result.deleted.filesRemoved}</li>
            </ul>
          </div>

          <p className="text-gray-600 mb-6">
            The system is now ready for a new program. Admin and instructor accounts have been preserved,
            along with all model templates.
          </p>

          <button
            onClick={handleReset}
            className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
