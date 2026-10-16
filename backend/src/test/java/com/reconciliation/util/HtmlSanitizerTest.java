package com.reconciliation.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class HtmlSanitizerTest {

    @Test
    void stripsScriptAndEventHandlers() {
        String dirty = "<p onclick=\"alert(1)\">ok</p><script>alert(1)</script>";
        String cleaned = HtmlSanitizer.sanitize(dirty);
        assertThat(cleaned).doesNotContain("script");
        assertThat(cleaned).doesNotContain("onclick");
        assertThat(cleaned).contains("<p>ok</p>");
    }

    @Test
    void stripsJavascriptUrls() {
        String dirty = "<a href=\"javascript:alert(1)\">x</a>";
        assertThat(HtmlSanitizer.sanitize(dirty)).doesNotContain("javascript:");
    }

    @Test
    void keepsNullAndEmpty() {
        assertThat(HtmlSanitizer.sanitize(null)).isNull();
        assertThat(HtmlSanitizer.sanitize("")).isEmpty();
    }
}
