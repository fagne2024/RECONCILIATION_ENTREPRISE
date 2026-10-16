package com.reconciliation.service;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

class AuthCookieServiceTest {

    @Test
    void writesHttpOnlyCookieAndCanReadItBack() {
        AuthCookieService service = new AuthCookieService();
        ReflectionTestUtils.setField(service, "expirationMs", 3_600_000L);

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        service.addTokenCookie(request, response, "jwt-value");

        String setCookie = response.getHeader("Set-Cookie");
        assertThat(setCookie).contains("AUTH_TOKEN=jwt-value");
        assertThat(setCookie).contains("HttpOnly");
        assertThat(setCookie).contains("SameSite=Lax");

        MockHttpServletRequest incoming = new MockHttpServletRequest();
        incoming.setCookies(new jakarta.servlet.http.Cookie("AUTH_TOKEN", "jwt-value"));
        assertThat(service.read(incoming)).isEqualTo("jwt-value");
    }
}
