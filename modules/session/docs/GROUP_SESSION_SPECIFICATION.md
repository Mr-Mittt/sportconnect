# Group session
## Definition
In group, we have 2 kinds of session, regular and custom, both are link with groupId and isPublic = false, by default.
-	Custom session: manual create by any member.
     Creation: Share the creation form with standalone session. With following customize
     Overview: sport is hidden and auto set by group sport
     Who: 2 radio buttons, all members, and specific. Specific comes with group member search (same with friend invite in standalone, but for group member). With all members, all group members will receive notification. With specific, selected members will receive notification. Same with standalone session sharing, no INVITED participants is created. Auto approve is enabled by default.
     Modal: share button trigger for invitation dialog with group member only
-	Regular session: auto-generated (author = group owner), configure via group setting.
## How it show
- Modal: Information, hide taken and open slot information
- A new Session tab, between Posts and chats, that show all session, group by 3 collapsible group, Ongoing, Scheduled, and History

# Configuration and generation
## Configuration
In group setting tab, a new section for group session configuration, same with other setting, only owner/admin has the permission. Other members are view-only. 
Group session configuration need: (maybe we need a new table for saving this data)
-	ON-Off switch for turn on turn off regular-session-generation. When off, hide all below.
-	Recurrence dropdown, weekly and monthly, when switch, if any current Recurrence session configuration of the current selection exist, show a confirmation dialog, “By switch the Recurrence mode, your current configurations not usable until you switch back.” “Stay/Got it”, “Got it” will disable all current configurations. And enable all configurations of the target mode .
-	Add button: next to Recurrence dropdown, trigger Recurrence session creation form, same design as standalone with section, follow the below order
      - Overview: sport is hidden and auto set by group sport
      - When:  
         - Weekday/month-day:  dropdown, depend on recurrence. Options also depends on recurrence
         - Start time, duration, end time: same as standalone. But no date picker.
     - Where: same as standalone.
     - Who: 2 radio buttons, all members, and specific. Specific comes with group member search (same with friend invite in standalone, but for group member).  (likely same as custom session but this is configuration then no notification sending here)
     - Fee: default is free
     - Session attribute: same as standalone
     - Save: on trigger, if any needed data missing, show warning popup, “your recurrence session missing information” “keep editing/save as draft”, when saving is successfully, show information pop, “your weekly/monthly session configuration on [Monday, … , Sundau]/[1st …. 31st] was saved” “Add another / close”. “Add another” will clear the form.
-	We limit 5 sessions per day
-	The added configuration will be shown under Recurrence + Add button, in collapsible section, group by day (weekday/month day), collapsed by default
     -	Title: {Day} (x), e.g. Tuesday (2) mean 2 configurations for Tuesday,
     -	When collapsed, show list of the time slot (start time – end time) and location, missing (draft) show missing (warning), draft status, order by start time ASC
     -	When un-collapsed, each time slot (start time – end time) become a row, with edit, delete button. Delete will show confirmation dialog, hard-delete.

## Generation
How is regular session generated from recurrence configuration: new db table to save the queue of recurrence configuration (id) need to be generated. The queue should support retry (Nearest day mean nearest in the future)
-	After server startup: a job collect all group that enable regular-session-generation and at least not draft recurrence configuration (not draft), then for each group we get the configuration that is nearest day compare with today (UTC) push to the queue, order by target date time ASC, if any configuration is collected, fire a event-listener to resolve the queue (This is down time recovering)
-	When the last regular session of a day completed, check the current enable configuration set of current group and collect all configurations for the nearest day, push to the queue, fire an event listener to handle. This mean when the last session of today complete, all session for the next recurrence day will be generated (check existing before generated). (2check here if it’s possible conflict with startup job)
-	On runtime, when owner/admin do the below actions, check today configurations, if any not end  yet, generate session with correct status. Next check nearest configured day. If any existing scheduled|ongoing between now and that day, let those session trigger auto generation, if not, push configuration to the queue to it be process
   - ON the regular-session-generation:
   - Add new recurrence configuration:
   - Switch recurrence mode
-	On runtime, when owner/admin do the below actions, show session cancel confirmation, “X session are available, Do you want to cancel those?” “Leave it there/Cancel”
   - OFF the regular-session-generation (all scheduled)
   - Delete recurrence configuration (scheduled session of deleted configuration)
   - Switch recurrence mode (all scheduled)

