import SwiftUI

struct SettingsView: View {
    @Environment(AuthStore.self) private var auth
    @ObservedObject private var settings = AppSettings.shared

    @State private var showServerForm = false
    @State private var confirmLogout = false

    var body: some View {
        NavigationStack {
            Form {
                Section("服务器") {
                    LabeledContent("地址", value: settings.baseURLString)
                    Button("修改服务器地址") { showServerForm = true }
                }

                if let user = auth.user {
                    Section("当前用户") {
                        LabeledContent("用户名", value: user.username)
                        LabeledContent("角色", value: user.role ?? "user")
                        LabeledContent("AI 模式", value: user.aiMode ?? "off")
                        if let cash = user.availableCash {
                            LabeledContent("可用现金", value: cash.moneyText + " 元")
                        }
                    }
                }

                Section {
                    Button("退出登录", role: .destructive) { confirmLogout = true }
                }
            }
            .navigationTitle("设置")
            .sheet(isPresented: $showServerForm) {
                NavigationStack { ServerSettingsForm() }
                    .presentationDetents([.medium])
            }
            .confirmationDialog("退出后将清除本地会话，确定退出？", isPresented: $confirmLogout, titleVisibility: .visible) {
                Button("退出登录", role: .destructive) {
                    Task { await auth.logout() }
                }
            }
        }
    }
}
