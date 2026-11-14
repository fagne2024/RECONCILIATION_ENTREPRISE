package com.reconciliation.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Enumeration;
import java.util.zip.GZIPInputStream;

/**
 * Décompresse les corps de requête envoyés en gzip par le frontend
 * (en-tête {@code Content-Encoding: gzip}, cf. gzip-request.interceptor.ts).
 *
 * Les lots de réconciliation envoient des dizaines de Mo de JSON : compressés, ils
 * passent ~10 à 20 fois plus vite sur un accès distant. La taille décompressée est
 * plafonnée (protection « bombe zip ») ; au-delà, la lecture échoue → 400/500.
 *
 * Enregistré en tête de chaîne servlet (cf. GlobalCorsConfig), avant tout lecteur du corps.
 */
public class GzipRequestFilter extends OncePerRequestFilter {

    private final long maxDecompressedBytes;

    public GzipRequestFilter(long maxDecompressedBytes) {
        this.maxDecompressedBytes = maxDecompressedBytes;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        String encoding = request.getHeader("Content-Encoding");
        return encoding == null || !"gzip".equalsIgnoreCase(encoding.trim());
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        filterChain.doFilter(new GzipRequestWrapper(request, maxDecompressedBytes), response);
    }

    static final class GzipRequestWrapper extends HttpServletRequestWrapper {
        private final long maxBytes;
        private ServletInputStream stream;
        private BufferedReader reader;

        GzipRequestWrapper(HttpServletRequest request, long maxBytes) {
            super(request);
            this.maxBytes = maxBytes;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            if (reader != null) {
                throw new IllegalStateException("getReader() a déjà été appelé");
            }
            if (stream == null) {
                stream = new LimitedGzipServletInputStream(
                    new GZIPInputStream(super.getInputStream(), 64 * 1024), maxBytes);
            }
            return stream;
        }

        @Override
        public BufferedReader getReader() throws IOException {
            if (reader == null) {
                String enc = getCharacterEncoding();
                Charset charset = enc != null ? Charset.forName(enc) : StandardCharsets.UTF_8;
                reader = new BufferedReader(new InputStreamReader(getInputStream(), charset));
            }
            return reader;
        }

        @Override
        public int getContentLength() {
            return -1;
        }

        @Override
        public long getContentLengthLong() {
            return -1L;
        }

        @Override
        public String getHeader(String name) {
            if (isHiddenHeader(name)) {
                return null;
            }
            return super.getHeader(name);
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            if (isHiddenHeader(name)) {
                return Collections.emptyEnumeration();
            }
            return super.getHeaders(name);
        }

        private static boolean isHiddenHeader(String name) {
            return "Content-Encoding".equalsIgnoreCase(name) || "Content-Length".equalsIgnoreCase(name);
        }
    }

    static final class LimitedGzipServletInputStream extends ServletInputStream {
        private final InputStream in;
        private final long maxBytes;
        private long count;
        private boolean finished;

        LimitedGzipServletInputStream(InputStream in, long maxBytes) {
            this.in = in;
            this.maxBytes = maxBytes;
        }

        @Override
        public int read() throws IOException {
            int b = in.read();
            if (b < 0) {
                finished = true;
            } else {
                add(1);
            }
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            int n = in.read(buf, off, len);
            if (n < 0) {
                finished = true;
            } else {
                add(n);
            }
            return n;
        }

        private void add(long n) throws IOException {
            count += n;
            if (count > maxBytes) {
                throw new IOException("Corps de requête décompressé trop volumineux (> " + maxBytes + " octets)");
            }
        }

        @Override
        public boolean isFinished() {
            return finished;
        }

        @Override
        public boolean isReady() {
            return true;
        }

        @Override
        public void setReadListener(ReadListener readListener) {
            throw new UnsupportedOperationException("Lecture asynchrone non supportée pour un corps gzip");
        }

        @Override
        public void close() throws IOException {
            in.close();
        }
    }
}
