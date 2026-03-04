package com.sportconnect.config;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

public class JavaRevision {

    public String memoryManagement() {
        A a = new A("1");
        assgin(a);
        return a.getA();
    }

    private void assgin(A a) {
        A b = new A("2");
        a.setA("3");
        a = b;
    }

    @AllArgsConstructor
    @Getter
    @Setter
    class A {
        String a;
    }
}
