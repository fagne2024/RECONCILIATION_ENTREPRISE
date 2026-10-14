package com.reconciliation.util;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class HashTest {
    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(10);
        String pwd = "Test@1234";
        if (args.length > 0) {
            pwd = args[0];
        }
        System.out.println(encoder.encode(pwd));
    }
}