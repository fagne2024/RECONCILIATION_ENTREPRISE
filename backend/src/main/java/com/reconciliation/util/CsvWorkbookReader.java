package com.reconciliation.util;

import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Lecture des fichiers texte (CSV/TXT/TSV) sous forme de classeur POI à cellules texte.
 *
 * <ul>
 *   <li>Encodage : UTF-8 si le contenu est valide, sinon Windows-1252 (fichiers Excel
 *   enregistrés en « CSV » sous Windows). Le BOM éventuel est retiré.</li>
 *   <li>Séparateur : tabulation, point-virgule ou virgule, celui qui revient le plus
 *   souvent (les CSV Excel en français utilisent le point-virgule).</li>
 *   <li>Guillemets doubles respectés dans les champs.</li>
 * </ul>
 */
public final class CsvWorkbookReader {

    private static final int DELIMITER_SAMPLE_LINES = 20;

    private CsvWorkbookReader() {
    }

    public static Workbook toWorkbook(InputStream is) throws IOException {
        String text = decode(is.readAllBytes());
        List<String> lines = text.lines().toList();
        char delimiter = detectDelimiter(lines);
        XSSFWorkbook wb = new XSSFWorkbook();
        Sheet sheet = wb.createSheet();
        int r = 0;
        for (String line : lines) {
            if (line.isBlank()) continue;
            Row row = sheet.createRow(r++);
            List<String> parts = splitLine(line, delimiter);
            for (int i = 0; i < parts.size(); i++) {
                row.createCell(i, CellType.STRING).setCellValue(parts.get(i));
            }
        }
        return wb;
    }

    static String decode(byte[] bytes) {
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes))
                    .toString();
        } catch (CharacterCodingException e) {
            text = new String(bytes, Charset.forName("windows-1252"));
        }
        if (!text.isEmpty() && text.charAt(0) == '﻿') {
            text = text.substring(1);
        }
        return text;
    }

    static char detectDelimiter(List<String> lines) {
        List<String> sample = lines.stream().filter(l -> !l.isBlank()).limit(DELIMITER_SAMPLE_LINES).toList();
        char best = '\t';
        long bestCount = -1;
        for (char candidate : new char[] {'\t', ';', ','}) {
            long count = 0;
            for (String line : sample) {
                count += line.chars().filter(ch -> ch == candidate).count();
            }
            if (count > bestCount) {
                bestCount = count;
                best = candidate;
            }
        }
        return best;
    }

    static List<String> splitLine(String line, char delimiter) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (ch == '"') {
                if (quoted && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cur.append('"');
                    i++;
                } else {
                    quoted = !quoted;
                }
            } else if (ch == delimiter && !quoted) {
                out.add(cur.toString());
                cur.setLength(0);
            } else {
                cur.append(ch);
            }
        }
        out.add(cur.toString());
        return out;
    }
}
