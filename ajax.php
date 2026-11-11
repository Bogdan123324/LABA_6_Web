<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond($data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function parameter(string $name, string $default = ''): string
{
    $value = $_POST[$name] ?? $_GET[$name] ?? $default;
    if (!is_string($value)) {
        respond(['error' => "Недопустимое значение параметра {$name}."], 400);
    }

    return trim($value);
}

function normalizeText(string $text): string
{
    static $alphabet = null;
    if ($alphabet === null) {
        $uppercase = preg_split('//u', 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', -1, PREG_SPLIT_NO_EMPTY);
        $lowercase = preg_split('//u', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя', -1, PREG_SPLIT_NO_EMPTY);
        $alphabet = array_combine($uppercase, $lowercase);
    }

    return str_replace('ё', 'е', strtr(strtolower($text), $alphabet));
}

function matchesWords(string $text, array $words): bool
{
    $haystack = normalizeText($text);
    foreach ($words as $word) {
        if (strpos($haystack, $word) === false) {
            return false;
        }
    }

    return true;
}

$defaultType = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' ? 'news' : '';
$type = parameter('type', $defaultType);
$sources = [
    'nickname' => 'nicknames.json',
    'news' => 'news.json',
];

if (!isset($sources[$type])) {
    respond(['error' => 'Параметр type должен быть nickname или news.'], 400);
}

$json = @file_get_contents(__DIR__ . '/data/' . $sources[$type]);
$records = $json === false ? null : json_decode($json, true);
if (!is_array($records)) {
    respond(['error' => 'Не удалось прочитать файл с данными.'], 500);
}

// Без action возвращается исходный массив по формату задания.
$action = parameter('action');
if ($action === '') {
    respond($records);
}

if ($action === 'detail' && $type === 'news') {
    $id = parameter('id');
    foreach ($records as $record) {
        if ((string) $record['id'] === $id) {
            respond(['item' => $record]);
        }
    }
    respond(['error' => 'Новость не найдена.'], 404);
}

if ($action !== 'list') {
    respond(['error' => 'Неизвестное действие.'], 400);
}

$query = parameter('q');
if (strlen($query) > 600) {
    respond(['error' => 'Сократите поисковый запрос.'], 400);
}

$words = preg_split('/\s+/u', normalizeText($query), -1, PREG_SPLIT_NO_EMPTY) ?: [];
$isNews = $type === 'news';
$titleField = $isNews ? 'title' : 'nickname';
$sort = parameter('sort', $isNews ? 'date-desc' : 'name-asc');
$filtered = array_filter($records, function (array $record) use ($isNews, $titleField, $words): bool {
    $fields = [$record[$titleField], $record['category']];
    if ($isNews) {
        $fields[] = $record['summary'];
        $fields[] = $record['text'];
    }

    return matchesWords(implode(' ', $fields), $words);
});

usort($filtered, function (array $a, array $b) use ($isNews, $titleField, $sort): int {
    if ($isNews && in_array($sort, ['date-asc', 'date-desc'], true)) {
        $comparison = strcmp($a['date'], $b['date']);
    } else {
        $comparison = strnatcmp(normalizeText($a[$titleField]), normalizeText($b[$titleField]));
    }
    if ($sort === 'date-desc' || $sort === 'name-desc') {
        $comparison = -$comparison;
    }

    return $comparison ?: strnatcmp((string) $a['id'], (string) $b['id']);
});

$offset = max(0, (int) parameter('offset', '0'));
$pageSize = $isNews ? 5 : 10;
$items = array_slice($filtered, $offset, $pageSize);
if ($isNews) {
    // Полный текст передаётся отдельным запросом при открытии новости.
    foreach ($items as &$item) {
        unset($item['text']);
    }
    unset($item);
}

respond(['items' => $items, 'total' => count($filtered)]);
