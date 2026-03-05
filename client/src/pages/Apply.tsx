import { useState, FormEvent, ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { submitApplication, ApplicationSubmitData } from '../services/applyApi'

const INITIAL_FORM: ApplicationSubmitData = {
  wsspSchoolNumber: '',
  schoolName: '',
  studentAFirstName: '',
  studentALastName: '',
  studentAEmail: '',
  studentBFirstName: '',
  studentBLastName: '',
  studentBEmail: '',
  teacherName: '',
  teacherEmail: '',
  cloneNumber: '',
  proteinName: '',
  pdbAccessionNumber: '',
  sequenceIdentity: '',
  researchArticleCitation: '',
}

export default function Apply() {
  const [formData, setFormData] = useState<ApplicationSubmitData>(INITIAL_FORM)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setPdfFile(file)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    const emailA = formData.studentAEmail.trim().toLowerCase()
    const emailB = formData.studentBEmail.trim().toLowerCase()

    if (emailA === emailB) {
      setError('Student A and Student B must have different email addresses.')
      return
    }

    if (!/^[A-Za-z0-9]{4}$/.test(formData.pdbAccessionNumber.trim())) {
      setError('PDB Accession Number must be exactly 4 alphanumeric characters (e.g. 1ABC).')
      return
    }

    if (!pdfFile) {
      setError('Please upload a PDF description of the protein function.')
      return
    }

    setLoading(true)
    try {
      await submitApplication(formData, pdfFile)
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputClasses = 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors text-sm'
  const labelClasses = 'block text-sm font-medium text-gray-700 mb-1'

  const bgDecorations = (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg className="absolute top-0 left-0 w-full h-64 opacity-10" viewBox="0 0 800 200" preserveAspectRatio="none">
        <defs>
          <linearGradient id="applyFadeRight" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: 'white', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: 'white', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <g fill="url(#applyFadeRight)">
          <rect x="20" y="30" width="20" height="20" opacity="0.8" />
          <rect x="60" y="50" width="15" height="15" opacity="0.6" />
          <rect x="100" y="20" width="25" height="25" opacity="0.7" />
          <rect x="150" y="60" width="12" height="12" opacity="0.5" />
          <rect x="200" y="35" width="18" height="18" opacity="0.6" />
          <rect x="250" y="70" width="10" height="10" opacity="0.4" />
          <rect x="300" y="25" width="22" height="22" opacity="0.7" />
          <rect x="350" y="55" width="14" height="14" opacity="0.5" />
          <rect x="400" y="40" width="16" height="16" opacity="0.6" />
        </g>
      </svg>
      <svg className="absolute bottom-0 right-0 w-full h-48" viewBox="0 0 1200 200" preserveAspectRatio="none">
        <path
          d="M0,100 C300,150 600,50 900,100 C1050,125 1150,80 1200,100 L1200,200 L0,200 Z"
          fill="rgba(255,255,255,0.05)"
        />
      </svg>
    </div>
  )

  if (submitted) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-600 via-blue-700 to-blue-900 relative overflow-hidden">
        {bgDecorations}
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              <div className="bg-blue-800 px-6 py-5">
                <h1 className="text-2xl font-bold text-white text-center">Application Submitted!</h1>
              </div>
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-700 font-medium mb-2">Your application has been received.</p>
                <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                  Both students should receive a confirmation email shortly.
                  Our team will review your application and you'll hear back with next steps.
                </p>
                <Link
                  to="/login"
                  className="inline-block bg-blue-800 text-white py-3 px-8 rounded-lg hover:bg-blue-900 transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
                >
                  Back to Login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-600 via-blue-700 to-blue-900 relative overflow-hidden">
      {bgDecorations}

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-blue-800 px-6 py-5">
              <h1 className="text-2xl font-bold text-white text-center">Protein Model Organizer</h1>
              <p className="text-blue-200 text-center text-sm mt-1">Student Team Application</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {error && (
                <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm rounded">
                  {error}
                </div>
              )}

              {/* Program Information */}
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Program Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClasses}>WSSP School Number</label>
                    <input
                      type="text"
                      name="wsspSchoolNumber"
                      value={formData.wsspSchoolNumber}
                      onChange={handleChange}
                      required
                      className={inputClasses}
                      placeholder="e.g. 42"
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>School Name</label>
                    <input
                      type="text"
                      name="schoolName"
                      value={formData.schoolName}
                      onChange={handleChange}
                      required
                      className={inputClasses}
                      placeholder="e.g. Ridgefield High School"
                    />
                  </div>
                </div>
              </section>

              {/* Student A */}
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Student A</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClasses}>First Name</label>
                    <input
                      type="text"
                      name="studentAFirstName"
                      value={formData.studentAFirstName}
                      onChange={handleChange}
                      required
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>Last Name</label>
                    <input
                      type="text"
                      name="studentALastName"
                      value={formData.studentALastName}
                      onChange={handleChange}
                      required
                      className={inputClasses}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClasses}>Email Address</label>
                    <input
                      type="email"
                      name="studentAEmail"
                      value={formData.studentAEmail}
                      onChange={handleChange}
                      required
                      className={inputClasses}
                      placeholder="student.a@school.edu"
                    />
                  </div>
                </div>
              </section>

              {/* Student B */}
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Student B</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClasses}>First Name</label>
                    <input
                      type="text"
                      name="studentBFirstName"
                      value={formData.studentBFirstName}
                      onChange={handleChange}
                      required
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>Last Name</label>
                    <input
                      type="text"
                      name="studentBLastName"
                      value={formData.studentBLastName}
                      onChange={handleChange}
                      required
                      className={inputClasses}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClasses}>Email Address</label>
                    <input
                      type="email"
                      name="studentBEmail"
                      value={formData.studentBEmail}
                      onChange={handleChange}
                      required
                      className={inputClasses}
                      placeholder="student.b@school.edu"
                    />
                  </div>
                </div>
              </section>

              {/* Teacher */}
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Teacher / Supervisor</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClasses}>Teacher Name</label>
                    <input
                      type="text"
                      name="teacherName"
                      value={formData.teacherName}
                      onChange={handleChange}
                      required
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>Teacher Email</label>
                    <input
                      type="email"
                      name="teacherEmail"
                      value={formData.teacherEmail}
                      onChange={handleChange}
                      required
                      className={inputClasses}
                    />
                  </div>
                </div>
              </section>

              {/* Protein Details */}
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Protein Details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClasses}>Clone #</label>
                    <input
                      type="text"
                      name="cloneNumber"
                      value={formData.cloneNumber}
                      onChange={handleChange}
                      required
                      className={inputClasses}
                      placeholder="e.g. Clone-12"
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>PDB Accession Number</label>
                    <input
                      type="text"
                      name="pdbAccessionNumber"
                      value={formData.pdbAccessionNumber}
                      onChange={handleChange}
                      required
                      maxLength={4}
                      className={inputClasses}
                      placeholder="e.g. 1ABC"
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>Name of Protein</label>
                    <input
                      type="text"
                      name="proteinName"
                      value={formData.proteinName}
                      onChange={handleChange}
                      required
                      className={inputClasses}
                      placeholder="e.g. Hemoglobin"
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>% Sequence Identity</label>
                    <input
                      type="text"
                      name="sequenceIdentity"
                      value={formData.sequenceIdentity}
                      onChange={handleChange}
                      required
                      className={inputClasses}
                      placeholder="e.g. 87.3"
                    />
                  </div>
                </div>
              </section>

              {/* Research */}
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Research</h2>
                <div className="space-y-4">
                  <div>
                    <label className={labelClasses}>Citation of Research Article</label>
                    <textarea
                      name="researchArticleCitation"
                      value={formData.researchArticleCitation}
                      onChange={handleChange}
                      required
                      rows={3}
                      className={`${inputClasses} resize-none`}
                      placeholder="Full citation of the research article describing your protein"
                    />
                  </div>
                  <div>
                    <label className={labelClasses}>
                      1-Page Protein Function Description{' '}
                      <span className="text-gray-400 font-normal">(PDF, max 10 MB)</span>
                    </label>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      required
                      className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-gray-300 rounded-lg py-2 px-3"
                    />
                    {pdfFile && (
                      <p className="mt-1 text-xs text-green-600">
                        Selected: {pdfFile.name} ({(pdfFile.size / 1024).toFixed(0)} KB)
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-800 text-white py-4 px-6 rounded-lg hover:bg-blue-900 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-[1.01] active:scale-[0.99]"
              >
                {loading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Submitting...</span>
                  </div>
                ) : (
                  'Submit Application'
                )}
              </button>

              <p className="text-center text-sm text-gray-500">
                Already have an account?{' '}
                <Link to="/login" className="text-blue-600 hover:text-blue-800 font-medium transition-colors">
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
