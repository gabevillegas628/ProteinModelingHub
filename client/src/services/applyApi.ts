const API_BASE = '/modeling/api';

export interface ApplicationSubmitData {
  wsspSchoolNumber: string;
  schoolName: string;
  studentAFirstName: string;
  studentALastName: string;
  studentAEmail: string;
  studentBFirstName: string;
  studentBLastName: string;
  studentBEmail: string;
  teacherName: string;
  teacherEmail: string;
  cloneNumber: string;
  proteinName: string;
  pdbAccessionNumber: string;
  sequenceIdentity: string;
  researchArticleCitation: string;
}

export async function submitApplication(
  data: ApplicationSubmitData,
  pdfFile: File
): Promise<{ message: string }> {
  const formData = new FormData();

  (Object.entries(data) as [string, string][]).forEach(([key, value]) => {
    formData.append(key, value);
  });

  formData.append('pdfFile', pdfFile);

  // No Authorization header (public endpoint)
  // No Content-Type header — browser sets multipart/form-data with boundary automatically
  const response = await fetch(`${API_BASE}/auth/apply`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Submission failed' }));
    throw new Error(error.error || 'Submission failed');
  }

  return response.json();
}
