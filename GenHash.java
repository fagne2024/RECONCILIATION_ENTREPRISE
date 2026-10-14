import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
public class GenHash {
    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(10);
        String password = args.length > 0 ? args[0] : "ChangezMoi@123";
        System.out.println(encoder.encode(password));
    }
}