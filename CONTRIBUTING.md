# Разработка

## Как поднять проект

См. «Запуск для разработки» в [`README.md`](./README.md).

## Ветки и PR

- Новые ветки — от `main`.
- PR — в `main`, мержится сквошем (squash-merge): история `main` остаётся
  линейной, одна ветка — один коммит.
- Заполните шаблон PR: что сделано, зачем, что прогнали, скриншоты для правок
  интерфейса.

## Перед PR

Прогоните то, что относится к вашим изменениям:

```bash
npm run typecheck --workspace=server
npm run typecheck --workspace=web
npm run smoke --workspace=server      # сквозные проверки сервера на временной библиотеке
node extension/tools/verify.mjs       # если менялось расширение
```

Если менялась десктопная оболочка (`desktop/src-tauri`):

```bash
cd desktop/src-tauri
cargo test
```

Подробности по каждой команде — в [`README.md`](./README.md) и
[`desktop/README.md`](./desktop/README.md).

## Язык

Комментарии в коде и текст коммитов — по-русски.
