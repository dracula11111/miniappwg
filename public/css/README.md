# WildGift CSS split (exact)

Эти файлы получены **строго** из вашего working `style.css` (без изменений).
Если подключить их в таком порядке, поведение будет 1:1 как со старым style.css.

## Порядок подключения (как у вас в index.html)

<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/layout.css">
<link rel="stylesheet" href="/css/components.css">
<link rel="stylesheet" href="/css/wheel.css">
<link rel="stylesheet" href="/css/cases.css">
<link rel="stylesheet" href="/css/profile.css">
<link rel="stylesheet" href="/css/bonus.css">

## Что это чинит

Если после прошлого разбиения на страницах Cases/Profile «ничего не нажималось», причина была в том, что часть правил
(оверлеи/слои/страницы) поменяла порядок или потерялась. Здесь порядок и содержимое полностью совпадают со style.css.
