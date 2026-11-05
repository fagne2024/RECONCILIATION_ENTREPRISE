package com.reconciliation.util;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;

public class UnlockUser {
    public static void main(String[] args) throws Exception {
        String url = "jdbc:mysql://localhost:3306/Reconciliation_app?allowPublicKeyRetrieval=true&useSSL=false&serverTimezone=UTC";
        String username = "root";
        String password = "";
        String target = args.length > 0 ? args[0] : "superadmin";
        
        Class.forName("com.mysql.cj.jdbc.Driver");
        try (Connection conn = DriverManager.getConnection(url, username, password)) {
            String sql = "UPDATE `user` SET failed_login_attempts=0, account_locked_until=NULL WHERE username=?";
            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, target);
                int updated = ps.executeUpdate();
                System.out.println("Updated " + updated + " rows for user=" + target);
            }
        }
    }
}