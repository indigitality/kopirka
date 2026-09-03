fn main() {
    // Тексты быстрой команды зашиты в бинарник через include_str! (src/quickaction.rs),
    // а лежат вне крейта — в app/quick-action. Говорим cargo следить и за ними,
    // иначе правка обработчика не попала бы в сборку до `cargo clean`.
    for path in [
        "../../quick-action/quick-add.sh",
        "../../quick-action/workflow/Info.plist",
        "../../quick-action/workflow/document.wflow",
    ] {
        println!("cargo:rerun-if-changed={path}");
    }
    tauri_build::build()
}
