import Foundation

final class CampusARMeasureRegistry {
  static let shared = CampusARMeasureRegistry()
  private init() {}

  weak var activeView: CampusARMeasureView?
}
