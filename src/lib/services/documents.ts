import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { ShipmateDocument, DocumentFolder, Department } from '@/lib/types';

export async function uploadDocument(
  name: string,
  originalName: string,
  size: number,
  fileType: string,
  folder: DocumentFolder,
  storagePath: string,
  downloadURL: string,
  uploadedBy: string,
  uploaderName: string,
  departmentId?: Department,
  description?: string
): Promise<ShipmateDocument> {
  const documentData = {
    name,
    originalName,
    size,
    fileType,
    folder,
    storagePath,
    downloadURL,
    uploadedBy,
    uploaderName,
    departmentId,
    description: description || '',
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'documents'), documentData);

  return {
    id: docRef.id,
    ...documentData,
    createdAt: Timestamp.now(),
  } as ShipmateDocument;
}

export async function fetchDocuments(
  folder: DocumentFolder,
  departmentId?: Department,
  pageSize: number = 50
): Promise<ShipmateDocument[]> {
  const constraints: QueryConstraint[] = [
    where('folder', '==', folder),
  ];

  if (departmentId) {
    constraints.push(where('departmentId', '==', departmentId));
  }

  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(pageSize));

  const q = query(collection(db, 'documents'), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as ShipmateDocument[];
}

export async function searchDocuments(
  searchTerm: string,
  folder?: DocumentFolder
): Promise<ShipmateDocument[]> {
  const constraints: QueryConstraint[] = [];

  if (folder) {
    constraints.push(where('folder', '==', folder));
  }

  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(100));

  const q = query(collection(db, 'documents'), ...constraints);
  const snapshot = await getDocs(q);

  const allDocs = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as ShipmateDocument[];

  return allDocs.filter(
    doc =>
      doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.originalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );
}

export async function deleteDocument(documentId: string): Promise<void> {
  await deleteDoc(doc(db, 'documents', documentId));
}

export async function getDocumentsByUploader(
  uploadedBy: string,
  pageSize: number = 50
): Promise<ShipmateDocument[]> {
  const q = query(
    collection(db, 'documents'),
    where('uploadedBy', '==', uploadedBy),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as ShipmateDocument[];
}
