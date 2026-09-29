import SwiftUI

struct LoginView: View {
    @Environment(AuthStore.self) private var auth
    @ObservedObject private var settings = AppSettings.shared

    @State private var username = ""
    @State private var password = ""
    @State private var isLoggingIn = false
    @State private var errorMessage: String?
    @State private var showServerSettings = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer()
                header
                Spacer()
                formCard
                Spacer()
            }
            .padding()
            .background(Color(.systemGroupedBackground))
            .navigationTitle("")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showServerSettings = true
                    } label: {
                        Label("服务器设置", systemImage: "server.rack")
                    }
                }
            }
            .sheet(isPresented: $showServerSettings) {
                NavigationStack {
                    ServerSettingsForm()
                }
                .presentationDetents([.medium])
            }
        }
    }

    private var header: some View {
        VStack(spacing: 12) {
            Image(systemName: "chart.line.uptrend.xyaxis.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
            Text("基金助手")
                .font(.largeTitle.bold())
            Text("基金持仓查看与交易操作")
                .foregroundStyle(.secondary)
        }
    }

    private var formCard: some View {
        VStack(spacing: 16) {
            TextField("用户名", text: $username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(12)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10))

            SecureField("密码", text: $password)
                .padding(12)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10))

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button {
                Task { await login() }
            } label: {
                HStack {
                    if isLoggingIn {
                        ProgressView().tint(.white)
                    } else {
                        Text("登录").bold()
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .disabled(isLoggingIn || username.isEmpty || password.isEmpty)

            Text(settings.baseURLString)
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(20)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    private func login() async {
        isLoggingIn = true
        errorMessage = nil
        defer { isLoggingIn = false }
        do {
            try await auth.login(username: username, password: password)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

/// 登录页与设置页共用的服务器地址表单
struct ServerSettingsForm: View {
    @ObservedObject private var settings = AppSettings.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section {
                TextField("http://192.168.1.100:8888", text: $settings.baseURLString)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } header: {
                Text("服务器地址")
            } footer: {
                Text("默认连接外网部署的后端 http://62.234.29.20:9999；本地调试可改为 http://localhost:8888，真机连本机请填电脑的局域网 IP。填写 http://…/api/ 也可以，会自动按源地址处理。")
            }
        }
        .navigationTitle("服务器设置")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("完成") { dismiss() }
            }
        }
    }
}
