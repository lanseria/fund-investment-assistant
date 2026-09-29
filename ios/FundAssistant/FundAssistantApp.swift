import SwiftUI

@main
struct FundAssistantApp: App {
    @State private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .task { await auth.bootstrap() }
        }
    }
}

struct RootView: View {
    @Environment(AuthStore.self) private var auth

    var body: some View {
        if auth.isCheckingSession {
            ProgressView("正在连接服务器…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(.systemGroupedBackground))
        } else if auth.isLoggedIn {
            MainTabView()
        } else {
            LoginView()
        }
    }
}
