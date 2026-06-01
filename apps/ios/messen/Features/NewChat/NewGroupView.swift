import SwiftUI

struct NewGroupView: View {
    let onGroupCreated: (Chat) -> Void

    @StateObject private var vm = NewGroupViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.darkBg.opacity(0.7).ignoresSafeArea()

            VStack(spacing: 0) {
                header
                nameField
                if !vm.selected.isEmpty { selectedChips }
                searchField
                content
                createBar
            }
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Pieces

    private var header: some View {
        HStack {
            HStack(spacing: 8) {
                Image(systemName: "person.2.fill")
                    .foregroundStyle(Color.brandViolet)
                Text("Новая группа")
                    .font(Typo.titleM)
                    .foregroundStyle(.white)
            }
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 32, height: 32)
                    .background(Color.white.opacity(0.06))
                    .clipShape(Circle())
            }
            .buttonStyle(PressDownStyle())
        }
        .padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 12)
    }

    private var nameField: some View {
        BrandTextField(title: "Название группы", text: $vm.name, placeholder: "Например, Команда",
                       autocapitalization: .sentences)
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
    }

    private var selectedChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(vm.selected) { u in
                    HStack(spacing: 6) {
                        Avatar(url: u.avatar, name: u.displayName, size: 22)
                        Text(u.displayName)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.white.opacity(0.9))
                        Button { vm.toggle(u) } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(.white.opacity(0.7))
                        }
                    }
                    .padding(.leading, 4).padding(.trailing, 8).padding(.vertical, 4)
                    .background(Color.brandViolet.opacity(0.15))
                    .overlay(Capsule().stroke(Color.brandViolet.opacity(0.4), lineWidth: 1))
                    .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.bottom, 8)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.white.opacity(0.4))
            TextField("Добавить участников…", text: $vm.query)
                .font(Typo.body)
                .foregroundStyle(.white)
                .tint(.brandViolet)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Color.white.opacity(0.04))
        .overlay(Capsule().stroke(Color.white.opacity(0.07), lineWidth: 1))
        .clipShape(Capsule())
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    @ViewBuilder
    private var content: some View {
        if vm.loading && vm.results.isEmpty {
            ProgressView().tint(.brandViolet)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if vm.query.isEmpty && vm.results.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "person.crop.circle.badge.plus")
                    .font(.system(size: 32))
                    .foregroundStyle(LinearGradient.brand)
                Text("Найди и добавь участников")
                    .font(Typo.bodyM).foregroundStyle(.white.opacity(0.55))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.bottom, 80)
        } else {
            ScrollView {
                LazyVStack(spacing: 4) {
                    ForEach(vm.results) { user in
                        Button { vm.toggle(user) } label: {
                            HStack(spacing: 12) {
                                Avatar(url: user.avatar, name: user.displayName, size: 38)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(user.displayName).font(Typo.bodyB).foregroundStyle(.white)
                                    Text("@\(user.username)").font(.system(size: 12)).foregroundStyle(.white.opacity(0.45))
                                }
                                Spacer()
                                if vm.isSelected(user) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(Color.brandViolet)
                                } else {
                                    Image(systemName: "circle")
                                        .foregroundStyle(.white.opacity(0.3))
                                }
                            }
                            .padding(.vertical, 8).padding(.horizontal, 12)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(Color.white.opacity(0.03))
                                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.white.opacity(0.05), lineWidth: 1))
                            )
                        }
                        .buttonStyle(PressDownStyle())
                    }
                }
                .padding(.horizontal, 12).padding(.bottom, 12)
            }
        }
    }

    private var createBar: some View {
        BrandButton(
            action: {
                Task {
                    if let chat = await vm.create() {
                        onGroupCreated(chat)
                        dismiss()
                    }
                }
            },
            isLoading: vm.creating,
            isDisabled: !vm.canCreate
        ) {
            Text("Создать группу · \(vm.selected.count) участн.")
        }
        .padding(.horizontal, 16).padding(.bottom, 24).padding(.top, 8)
    }
}
