# Spock Framework Testing Guide

## Overview

Spock is a testing and specification framework for Java and Groovy applications. It combines the best features of JUnit, Mockito, and BDD frameworks.

---

## ✅ Configuration Complete

### **1. Gradle Configuration**

**Plugins Added:**
```gradle
plugins {
    id 'groovy'  // Added for Spock
}
```

**Dependencies Added:**
```gradle
// Spock Framework
testImplementation platform('org.spockframework:spock-bom:2.3-groovy-4.0')
testImplementation 'org.spockframework:spock-core'
testImplementation 'org.spockframework:spock-spring'
testImplementation 'org.apache.groovy:groovy:4.0.15'
```

---

## 📁 Project Structure

```
server/
├── src/
│   ├── main/
│   │   └── java/com/sportconnect/
│   └── test/
│       ├── groovy/com/sportconnect/     ✅ Spock tests here
│       │   ├── repository/
│       │   │   ├── UserRepositorySpec.groovy      ✅
│       │   │   └── SportRepositorySpec.groovy     ✅
│       │   └── dto/
│       │       └── UserResponseSpec.groovy        ✅
│       └── resources/
│           └── application-test.yml               ✅
```

---

## 🧪 Example Tests Created

### **1. Repository Test (UserRepositorySpec.groovy)**

```groovy
@DataJpaTest
class UserRepositorySpec extends Specification {

    @Autowired
    UserRepository userRepository

    def "should save and find user by email"() {
        given: "a user with email"
        def user = User.builder()
                .email("test@example.com")
                .passwordHash("hashedPassword")
                .build()

        when: "user is saved"
        userRepository.save(user)

        then: "user can be found by email"
        def foundUser = userRepository.findByEmail("test@example.com")
        foundUser.isPresent()
        foundUser.get().email == "test@example.com"
    }
}
```

### **2. DTO Test (UserResponseSpec.groovy)**

```groovy
class UserResponseSpec extends Specification {

    def "should create UserResponse from User entity"() {
        given: "a user entity"
        def user = User.builder()
                .email("test@example.com")
                .firstName("John")
                .lastName("Doe")
                .build()

        when: "converting to UserResponse"
        def response = UserResponse.fromEntity(user)

        then: "all fields are mapped correctly"
        response.email == "test@example.com"
        response.firstName == "John"
        response.lastName == "Doe"
    }
}
```

---

## 📝 Spock Syntax Guide

### **Test Structure (Given-When-Then)**

```groovy
def "test description"() {
    given: "setup phase - prepare test data"
    def user = new User(email: "test@example.com")
    
    when: "action phase - execute the code under test"
    def result = userService.save(user)
    
    then: "assertion phase - verify the results"
    result != null
    result.email == "test@example.com"
}
```

### **Expect Block (Simple Tests)**

```groovy
def "should calculate sum"() {
    expect: "sum of 2 and 3 is 5"
    calculator.sum(2, 3) == 5
}
```

### **Where Block (Data-Driven Tests)**

```groovy
def "should validate email format"() {
    expect:
    validator.isValid(email) == isValid
    
    where:
    email                  | isValid
    "test@example.com"     | true
    "invalid-email"        | false
    "test@"                | false
    "@example.com"         | false
}
```

### **Mocking with Spock**

```groovy
def "should call repository when saving user"() {
    given: "a mocked repository"
    def mockRepo = Mock(UserRepository)
    def service = new UserService(mockRepo)
    def user = new User(email: "test@example.com")
    
    when: "saving user"
    service.save(user)
    
    then: "repository save is called once"
    1 * mockRepo.save(user)
}
```

### **Stubbing with Spock**

```groovy
def "should return user when found"() {
    given: "a stubbed repository"
    def mockRepo = Stub(UserRepository)
    mockRepo.findByEmail("test@example.com") >> Optional.of(user)
    
    when: "finding user"
    def result = service.findByEmail("test@example.com")
    
    then: "user is returned"
    result.isPresent()
}
```

---

## 🎯 Common Annotations

### **Spring Boot Test Annotations**

```groovy
@SpringBootTest              // Full application context
@WebMvcTest                  // Controller layer only
@DataJpaTest                 // Repository layer only
@MockBean                    // Mock Spring beans
@Autowired                   // Inject dependencies
```

### **Spock Annotations**

```groovy
@Subject                     // Mark the class under test
@Shared                      // Share field across test methods
@Stepwise                    // Execute tests in order
@Ignore                      // Skip test
@Timeout(5)                  // Test timeout in seconds
```

---

## 🚀 Running Tests

### **Run All Tests**
```bash
./gradlew test
```

### **Run Specific Test**
```bash
./gradlew test --tests UserRepositorySpec
```

### **Run with Coverage**
```bash
./gradlew test jacocoTestReport
```

### **Run in Continuous Mode**
```bash
./gradlew test --continuous
```

---

## 📊 Test Examples by Layer

### **1. Repository Layer Tests**

```groovy
@DataJpaTest
class UserRepositorySpec extends Specification {
    
    @Autowired
    UserRepository userRepository
    
    @Autowired
    TestEntityManager entityManager
    
    def "should find user by email"() {
        given:
        def user = createUser("test@example.com")
        entityManager.persist(user)
        entityManager.flush()
        
        when:
        def found = userRepository.findByEmail("test@example.com")
        
        then:
        found.isPresent()
        found.get().email == "test@example.com"
    }
}
```

### **2. Service Layer Tests**

```groovy
class UserServiceSpec extends Specification {
    
    UserRepository userRepository = Mock()
    PasswordEncoder passwordEncoder = Mock()
    UserService userService = new UserService(userRepository, passwordEncoder)
    
    def "should register new user"() {
        given:
        def request = new RegisterRequest(
            email: "test@example.com",
            password: "password123"
        )
        
        when:
        def result = userService.register(request)
        
        then:
        1 * passwordEncoder.encode("password123") >> "hashedPassword"
        1 * userRepository.save(_) >> { User user ->
            user.passwordHash == "hashedPassword"
            user
        }
        result.email == "test@example.com"
    }
}
```

### **3. Controller Layer Tests**

```groovy
@WebMvcTest(AuthController)
class AuthControllerSpec extends Specification {
    
    @Autowired
    MockMvc mockMvc
    
    @MockBean
    AuthService authService
    
    def "should register user successfully"() {
        given:
        def request = new RegisterRequest(
            email: "test@example.com",
            password: "password123"
        )
        
        when:
        def response = mockMvc.perform(
            post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(toJson(request))
        )
        
        then:
        1 * authService.register(request) >> new UserResponse(email: "test@example.com")
        response.andExpect(status().isOk())
    }
}
```

---

## 🔍 Best Practices

### **1. Use Descriptive Test Names**
```groovy
// Good
def "should throw exception when email already exists"() { }

// Bad
def "test1"() { }
```

### **2. One Assertion Per Test**
```groovy
// Good
def "should save user"() {
    when:
    def result = userService.save(user)
    
    then:
    result != null
}

def "should set user id after save"() {
    when:
    def result = userService.save(user)
    
    then:
    result.id != null
}
```

### **3. Use Data-Driven Tests for Multiple Scenarios**
```groovy
def "should validate password strength"() {
    expect:
    validator.isStrong(password) == expected
    
    where:
    password      | expected
    "12345"       | false
    "password"    | false
    "Pass123!"    | true
    "VeryStr0ng!" | true
}
```

### **4. Clean Up Resources**
```groovy
def cleanup() {
    // Clean up after each test
    userRepository.deleteAll()
}

def cleanupSpec() {
    // Clean up after all tests
    database.shutdown()
}
```

---

## 📚 Additional Resources

- **Spock Documentation:** https://spockframework.org/
- **Spock Primer:** https://spockframework.org/spock/docs/2.3/
- **Spring Boot Testing:** https://spring.io/guides/gs/testing-web/

---

## ✅ Next Steps

1. **Run the example tests:**
   ```bash
   ./gradlew test
   ```

2. **Create tests for services (Day 3-4)**
3. **Create tests for controllers (Day 5-7)**
4. **Add integration tests with TestContainers**

---

**Spock Framework Configured Successfully!** ✅

You can now write expressive, readable tests using Groovy and Spock.
