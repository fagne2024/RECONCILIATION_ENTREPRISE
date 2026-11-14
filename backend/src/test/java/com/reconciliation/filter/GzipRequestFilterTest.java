package com.reconciliation.filter;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.GZIPOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Décompression des lots JSON envoyés en gzip par le frontend. */
class GzipRequestFilterTest {

    private static byte[] gzip(String s) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream gz = new GZIPOutputStream(out)) {
            gz.write(s.getBytes(StandardCharsets.UTF_8));
        }
        return out.toByteArray();
    }

    private HttpServletRequest filtrer(MockHttpServletRequest req, long max) throws Exception {
        AtomicReference<HttpServletRequest> seen = new AtomicReference<>();
        MockFilterChain chain = new MockFilterChain() {
            @Override
            public void doFilter(jakarta.servlet.ServletRequest request, jakarta.servlet.ServletResponse response) {
                seen.set((HttpServletRequest) request);
            }
        };
        new GzipRequestFilter(max).doFilter(req, new MockHttpServletResponse(), chain);
        return seen.get();
    }

    @Test
    void corpsGzip_estDecompresseEtEnTetesMasques() throws Exception {
        String json = "{\"boFileContent\":[{\"Numéro Trans GU\":\"123\"}]}".repeat(1000);
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/reconciliation/reconcile");
        req.addHeader("Content-Encoding", "gzip");
        req.setContentType("application/json");
        req.setCharacterEncoding("UTF-8");
        req.setContent(gzip(json));

        HttpServletRequest vu = filtrer(req, 10_000_000);

        assertThat(new String(vu.getInputStream().readAllBytes(), StandardCharsets.UTF_8)).isEqualTo(json);
        assertThat(vu.getHeader("Content-Encoding")).isNull();
        assertThat(vu.getContentLengthLong()).isEqualTo(-1L);
    }

    @Test
    void corpsNonCompresse_inchange() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/x");
        req.setContent("{\"a\":1}".getBytes(StandardCharsets.UTF_8));

        HttpServletRequest vu = filtrer(req, 10);

        assertThat(vu).isSameAs(req);
    }

    @Test
    void bombeZip_refuseeAuDelaDuPlafond() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/x");
        req.addHeader("Content-Encoding", "gzip");
        req.setContent(gzip("0".repeat(100_000)));

        HttpServletRequest vu = filtrer(req, 1_000);

        assertThatThrownBy(() -> vu.getInputStream().readAllBytes())
            .isInstanceOf(IOException.class)
            .hasMessageContaining("trop volumineux");
    }
}
