import SwiftUI

struct MainTabView: View {
    @State private var holdingsStore = HoldingsStore()
    @State private var dcaStore = DcaPlanStore()
    @State private var dictStore = DictStore()
    @State private var selection = LaunchArgs.initialTab

    var body: some View {
        TabView(selection: $selection) {
            HoldingsView()
                .tabItem { Label("持仓", systemImage: "list.bullet.rectangle.portrait") }
                .tag(0)
            FundProfitsView()
                .tabItem { Label("收益", systemImage: "chart.pie") }
                .tag(1)
            DcaPlansView()
                .tabItem { Label("定投", systemImage: "calendar.badge.clock") }
                .tag(2)
            SettingsView()
                .tabItem { Label("设置", systemImage: "gearshape") }
                .tag(3)
        }
        .environment(holdingsStore)
        .environment(dcaStore)
        .environment(dictStore)
        .task { await dictStore.load() }
    }
}
