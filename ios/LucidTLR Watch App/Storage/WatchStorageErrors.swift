import Foundation

enum WatchStorageError: Error, Equatable {
  case missingDocumentsDirectory
  case invalidSessionId
  case corruptJSONLine(fileName: String, lineNumber: Int)
  case missingManifest
  case ackDoesNotMatchPackage
}
