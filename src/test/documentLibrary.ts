import { resetDocumentLibrarySession } from '../app/documentLibrarySession';
import { defaultDocumentLibraryService } from '../editor/persistence/documentLibraryService';

/**
 * Empties the document library and forgets which document is open, so a test
 * starts as the app does on first use. Without IndexedDB (jsdom) the library
 * lives in memory for the whole test file, so call this before each test.
 */
export async function clearDocumentLibrary() {
  const { entries } = await defaultDocumentLibraryService.listEntries();
  for (const entry of entries) {
    await defaultDocumentLibraryService.remove(entry.id);
  }
  resetDocumentLibrarySession();
}
