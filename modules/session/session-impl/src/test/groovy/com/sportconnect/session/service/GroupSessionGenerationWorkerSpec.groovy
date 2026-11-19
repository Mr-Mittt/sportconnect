package com.sportconnect.session.service

import spock.lang.Specification

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * SESSION-GROUP-5 review: one asynchronous worker per instance, a queue of one, nudges coalesce, a failing drain never kills it.
 */
class GroupSessionGenerationWorkerSpec extends Specification {

    GroupSessionGenerationRunner runner = Mock()

    def "synchronous: a nudge drains on the calling thread, once"() {
        given:
        def worker = new GroupSessionGenerationWorker(runner, false)
        Thread drainedOn = null

        when:
        worker.nudge()

        then:
        1 * runner.processDue() >> { drainedOn = Thread.currentThread(); 0 }
        drainedOn == Thread.currentThread()
    }

    def "asynchronous: a nudge returns at once while the runner is busy, and runs on the worker thread"() {
        given:
        def worker = new GroupSessionGenerationWorker(runner, true)
        def started = new CountDownLatch(1)
        def release = new CountDownLatch(1)
        Thread drainedOn = null
        runner.processDue() >> { drainedOn = Thread.currentThread(); started.countDown(); release.await(10, TimeUnit.SECONDS); 0 }

        when:
        long before = System.nanoTime()
        worker.nudge()
        long tookMillis = (System.nanoTime() - before) / 1_000_000

        then:
        started.await(10, TimeUnit.SECONDS)
        tookMillis < 1000
        drainedOn != Thread.currentThread()
        drainedOn.name == "group-session-generation"

        cleanup:
        release.countDown()
        worker.shutdown()
    }

    def "nudges coalesce: one drain running and one queued, every further nudge is dropped (the queued drain sees what they planned)"() {
        given:
        def worker = new GroupSessionGenerationWorker(runner, true)
        def started = new CountDownLatch(1)
        def release = new CountDownLatch(1)
        def drains = new AtomicInteger()
        runner.processDue() >> { drains.incrementAndGet(); started.countDown(); release.await(10, TimeUnit.SECONDS); 0 }

        when:
        worker.nudge()
        started.await(10, TimeUnit.SECONDS)            // the first drain is running
        10.times { worker.nudge() }                    // one is queued, nine are dropped
        release.countDown()
        worker.shutdown()                              // waits for the running and the queued drain

        then:
        drains.get() == 2
    }

    def "a failing drain is caught and logged: the worker survives and drains again on the next nudge"() {
        given:
        def worker = new GroupSessionGenerationWorker(runner, true)
        def calls = new AtomicInteger()
        runner.processDue() >> { if (calls.incrementAndGet() == 1) { throw new IllegalStateException("db down") }; 0 }

        when:
        worker.nudge()
        waitFor { calls.get() >= 1 }
        worker.nudge()
        worker.shutdown()

        then:
        noExceptionThrown()
        calls.get() == 2
    }

    def "a synchronous drain that fails is caught too: the change that nudged must never fail"() {
        given:
        def worker = new GroupSessionGenerationWorker(runner, false)
        runner.processDue() >> { throw new IllegalStateException("db down") }

        when:
        worker.nudge()

        then:
        noExceptionThrown()
    }

    private static void waitFor(Closure<Boolean> condition) {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10)
        while (!condition() && System.nanoTime() < deadline) {
            Thread.sleep(10)
        }
    }
}
